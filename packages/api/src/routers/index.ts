import { type contract, MEMBER_SUSPENDED_MESSAGE } from "@codesphere/contract";
import { auditLog } from "@codesphere/db/schema/audit";
import { user } from "@codesphere/db/schema/auth";
import { questions } from "@codesphere/db/schema/questions";
import { reputationEvents } from "@codesphere/db/schema/reputation";
import { SocialConnectError } from "@codesphere/social";
import type { RouterContractClient } from "@orpc/contract";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { updateHackathon } from "../admin-hackathons";
import { kpiReport } from "../admin-kpi";
import { listMembers, setSuspension } from "../admin-members";
import {
	createShareTargetLoader,
	createSocialPostStore,
	publishShare,
} from "../admin-social";
import {
	createTag,
	deleteTag,
	listTags,
	renameTag,
	setTagReserved,
} from "../admin-tags";
import { createAgentsHandlers } from "../agents/handlers";
import { AgentError, agentPreset, createAgentService } from "../agents/service";
import { requireAdmin } from "../authorization";
import { communitySnapshot } from "../community/service";
import { decodeCursor, encodeCursor } from "../cursor";
import { unexpectedErrors } from "../errors";
import { isRead, isWatchSubmission } from "../exposure";
import { createMixedFeedHandlers } from "../feed-mixed/handlers";
import { loadHackathons } from "../hackathons";
import { impl } from "../index";
import { sanitizeMarkdown } from "../markdown/sanitizer";
import { deleteMember } from "../members-delete";
import { exportMember } from "../members-export";
import {
	createOrganizationsAdminHandlers,
	createOrganizationsHandlers,
} from "../organizations/handlers";
import { ownProfile, publicProfile } from "../profile";
import {
	createAnswersHandlers,
	createFeedHandlers,
	createQuestionsHandlers,
	createVotesHandlers,
} from "../questions/handlers";
import { createQuestionService, QuestionError } from "../questions/service";
import { consume, socialLimiter } from "../rate-limit";
import { createRankingsHandlers } from "../reputation/handlers";
import { reputationOf } from "../reputation/service";
import { isSuspended } from "../suspension";
import {
	followedTags,
	followTag,
	searchTags,
	skipTagsOnboarding,
	unfollowTag,
} from "../tags";
import { webVitalsByCountry } from "../vitals/service";
import {
	createWatchAdminHandlers,
	createWatchHandlers,
} from "../watch/handlers";

// The authorization guard behind every admin procedure (spec §2). Throws the typed
// UNAUTHORIZED / FORBIDDEN error declared on the admin contract.
const isAdmin = impl.middleware(async ({ context, next }) => {
	const result = requireAdmin(context.session);
	if (!result.ok) {
		throw new ORPCError(result.code);
	}
	return next();
});

// The typed refusal of a moderation outcome (#123).
const refusal = (
	code: "NOT_FOUND" | "CONFLICT" | "FORBIDDEN",
	errors: {
		NOT_FOUND: () => Error;
		CONFLICT: () => Error;
		FORBIDDEN: (options?: { message?: string }) => Error;
	},
) =>
	code === "NOT_FOUND"
		? errors.NOT_FOUND()
		: code === "FORBIDDEN"
			? errors.FORBIDDEN({
					message: "You cannot moderate a Member of equal or higher rank.",
				})
			: errors.CONFLICT();

// The signed-in staff member behind an admin write; `isAdmin` has already refused anonymous calls.
const actorOf = (session: { user: { id: string } } | null) => {
	if (!session) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return session.user.id;
};

// The typed refusal of a Tag outcome (#125).
const tagRefusal = (
	code: "NOT_FOUND" | "CONFLICT",
	errors: { NOT_FOUND: () => Error; CONFLICT: () => Error },
) => (code === "NOT_FOUND" ? errors.NOT_FOUND() : errors.CONFLICT());

// A failed OAuth connection (#266) is a CONFLICT carrying a message safe to show an Admin; anything
// else is a real error and is rethrown.
const connectRefusal = (
	error: unknown,
	errors: { CONFLICT: (options: { message: string }) => Error },
) =>
	error instanceof SocialConnectError
		? errors.CONFLICT({ message: error.message })
		: error;

// A key over its 120 requests per minute is refused with 429 and the wait (spec §3), never
// treated as anonymous: an agent must back off, not re-authenticate (#50).
const refuseRateLimitedKeys = impl.middleware(async ({ context, next }) => {
	if (context.apiKeyRetryAfter !== undefined) {
		throw new ORPCError("TOO_MANY_REQUESTS", {
			data: { retryAfter: context.apiKeyRetryAfter },
		});
	}
	return next();
});

// A suspended Member keeps reading but every write is refused with a typed error (#123).
const refuseSuspendedWrites = impl.middleware(
	async ({ context, procedure, next }) => {
		if (isSuspended(context.session) && !isRead(procedure)) {
			throw new ORPCError("FORBIDDEN", { message: MEMBER_SUSPENDED_MESSAGE });
		}
		return next();
	},
);

// An Agent's key carries a preset (spec §2): a read-only key refuses every write (#52).
const enforceAgentPreset = impl.middleware(
	async ({ context, procedure, next }) => {
		const user = context.session?.user as
			| { id: string; kind?: string }
			| undefined;
		if (user?.kind === "agent" && !isRead(procedure)) {
			const preset = await agentPreset(context.db, user.id);
			// `curate` may only propose links to the watch feed (#255).
			const allowed =
				preset === "contribute" ||
				(preset === "curate" && isWatchSubmission(procedure));
			if (!allowed) {
				throw new ORPCError("FORBIDDEN", {
					message:
						preset === "curate"
							? "This key may only propose watch links."
							: "This key is read-only.",
				});
			}
		}
		return next();
	},
);

export const appRouter = impl
	.use(unexpectedErrors)
	.use(refuseRateLimitedKeys)
	.use(refuseSuspendedWrites)
	.use(enforceAgentPreset)
	.router({
		health: {
			check: impl.health.check.handler(({ context }) => ({
				status: "ok" as const,
				...context.release,
			})),
			ready: impl.health.ready.handler(async ({ context, errors }) => {
				try {
					await context.db.execute(sql`select 1`);
				} catch (error) {
					context.logger.warn({ err: error }, "database not reachable");
					throw errors.SERVICE_UNAVAILABLE();
				}
				return { status: "ready" as const };
			}),
		},
		members: {
			me: impl.members.me.handler(async ({ context, errors }) => {
				const userId = context.session?.user.id;
				if (!userId) {
					throw errors.UNAUTHORIZED();
				}
				const [row] = await context.db
					.select()
					.from(user)
					.where(eq(user.id, userId));
				if (!row) {
					throw errors.UNAUTHORIZED();
				}
				const [asked] = await context.db
					.select({ id: questions.id })
					.from(questions)
					.where(
						and(eq(questions.authorId, userId), isNull(questions.deletedAt)),
					)
					.limit(1);
				return {
					...ownProfile(row, await reputationOf(context.db, row)),
					hasAskedQuestion: asked !== undefined,
				};
			}),
			update: impl.members.update.handler(
				async ({ context, input, errors }) => {
					const userId = context.session?.user.id;
					if (!userId) {
						throw errors.UNAUTHORIZED();
					}
					const [row] = await context.db
						.update(user)
						.set(input)
						.where(eq(user.id, userId))
						.returning();
					if (!row) {
						throw errors.UNAUTHORIZED();
					}
					return ownProfile(row, await reputationOf(context.db, row));
				},
			),
			export: impl.members.export.handler(async ({ context, errors }) => {
				const me = context.session?.user as
					| { id: string; kind?: string }
					| undefined;
				if (!me) {
					throw errors.UNAUTHORIZED();
				}
				if (me.kind !== "human") {
					throw errors.FORBIDDEN();
				}
				const data = await exportMember(context.db, me.id);
				if (!data) {
					throw errors.UNAUTHORIZED();
				}
				return data;
			}),
			delete: impl.members.delete.handler(
				async ({ context, input, errors }) => {
					const me = context.session?.user as
						| { id: string; kind?: string }
						| undefined;
					if (!me) {
						throw errors.UNAUTHORIZED();
					}
					if (me.kind !== "human") {
						throw errors.FORBIDDEN();
					}
					await deleteMember(context.db, me.id, input.deleteContent);
					return { success: true };
				},
			),
			get: impl.members.get.handler(async ({ context, input, errors }) => {
				const [row] = await context.db
					.select()
					.from(user)
					.where(eq(user.id, input.id));
				if (!row) {
					throw errors.NOT_FOUND();
				}
				// A deleted Member's journal is kept (#243), but its total is not shown.
				return publicProfile(
					row,
					row.suspensionReason === "deleted"
						? 0
						: await reputationOf(context.db, row),
				);
			}),
		},
		hackathons: {
			list: impl.hackathons.list.handler(async ({ context, input }) => ({
				items: await loadHackathons(context.db, undefined, input.limit),
				nextCursor: null,
			})),
			get: impl.hackathons.get.handler(async ({ context, input, errors }) => {
				const [found] = await loadHackathons(
					context.db,
					{ slug: input.slug },
					1,
				);
				if (!found) {
					throw errors.NOT_FOUND();
				}
				return found;
			}),
		},
		admin: {
			kpi: impl.admin.kpi
				.use(isAdmin)
				.handler(async ({ context, input }) =>
					kpiReport(context.db, input.period),
				),
			hackathons: {
				update: impl.admin.hackathons.update
					.use(isAdmin)
					.handler(async ({ context, input, errors }) => {
						const outcome = await updateHackathon(
							context.db,
							actorOf(context.session),
							input,
						);
						if (outcome.ok) {
							return outcome.hackathon;
						}
						if (outcome.code === "BAD_REQUEST") {
							throw errors.BAD_REQUEST({
								data: {
									issues: [{ path: [outcome.path], message: outcome.message }],
								},
							});
						}
						if (outcome.code === "NOT_FOUND") {
							throw errors.NOT_FOUND();
						}
						throw errors.CONFLICT({ data: { version: outcome.version } });
					}),
			},
			members: {
				list: impl.admin.members.list
					.use(isAdmin)
					.handler(async ({ context, input, errors }) => {
						const page = await listMembers(context.db, input);
						if (!page) {
							throw errors.BAD_REQUEST({
								data: {
									issues: [{ path: ["cursor"], message: "Invalid cursor" }],
								},
							});
						}
						return page;
					}),
				suspend: impl.admin.members.suspend
					.use(isAdmin)
					.handler(async ({ context, input, errors }) => {
						const actorId = actorOf(context.session);
						if (input.id === actorId) {
							throw errors.FORBIDDEN({
								message: "An Admin cannot suspend themself.",
							});
						}
						const outcome = await setSuspension(
							context.db,
							actorId,
							String(context.session?.user.role),
							input.id,
							{ suspend: true, reason: input.reason },
						);
						if (!outcome.ok) {
							throw refusal(outcome.code, errors);
						}
						return outcome.member;
					}),
				reactivate: impl.admin.members.reactivate
					.use(isAdmin)
					.handler(async ({ context, input, errors }) => {
						const outcome = await setSuspension(
							context.db,
							actorOf(context.session),
							String(context.session?.user.role),
							input.id,
							{ suspend: false },
						);
						if (!outcome.ok) {
							throw refusal(outcome.code, errors);
						}
						return outcome.member;
					}),
			},
			tags: {
				list: impl.admin.tags.list
					.use(isAdmin)
					.handler(async ({ context }) => ({
						items: await listTags(context.db),
					})),
				create: impl.admin.tags.create
					.use(isAdmin)
					.handler(async ({ context, input, errors }) => {
						const outcome = await createTag(
							context.db,
							actorOf(context.session),
							input.name,
							input.reserved,
						);
						if (!outcome.ok) {
							throw errors.CONFLICT();
						}
						return outcome.tag;
					}),
				setReserved: impl.admin.tags.setReserved
					.use(isAdmin)
					.handler(async ({ context, input, errors }) => {
						const outcome = await setTagReserved(
							context.db,
							actorOf(context.session),
							input,
						);
						if (!outcome.ok) {
							throw tagRefusal(outcome.code, errors);
						}
						return outcome.tag;
					}),
				rename: impl.admin.tags.rename
					.use(isAdmin)
					.handler(async ({ context, input, errors }) => {
						const outcome = await renameTag(
							context.db,
							actorOf(context.session),
							input,
						);
						if (!outcome.ok) {
							throw tagRefusal(outcome.code, errors);
						}
						return outcome.tag;
					}),
				delete: impl.admin.tags.delete
					.use(isAdmin)
					.handler(async ({ context, input, errors }) => {
						const outcome = await deleteTag(
							context.db,
							actorOf(context.session),
							input.id,
						);
						if (!outcome.ok) {
							throw tagRefusal(outcome.code, errors);
						}
						return { success: true };
					}),
			},
			social: {
				status: impl.admin.social.status
					.use(isAdmin)
					.handler(async ({ context }) => ({
						platforms: context.social?.siteUrl
							? [...(context.social.publisher?.platforms ?? [])]
							: [],
						accounts: context.social?.accounts
							? (await context.social.accounts.status()).map((account) => ({
									...account,
									expiresAt: account.expiresAt?.toISOString() ?? null,
									connectedAt: account.connectedAt?.toISOString() ?? null,
								}))
							: [],
					})),
				connect: impl.admin.social.connect
					.use(isAdmin)
					.handler(async ({ context, input, errors }) => {
						const actorId = actorOf(context.session);
						await consume(socialLimiter, actorId);
						if (!context.social?.accounts) {
							throw errors.SERVICE_UNAVAILABLE();
						}
						try {
							return {
								authorizationUrl: await context.social.accounts.begin(
									input.platform,
									actorId,
								),
							};
						} catch (error) {
							throw connectRefusal(error, errors);
						}
					}),
				completeConnect: impl.admin.social.completeConnect
					.use(isAdmin)
					.handler(async ({ context, input, errors }) => {
						const actorId = actorOf(context.session);
						await consume(socialLimiter, actorId);
						if (!context.social?.accounts) {
							throw errors.SERVICE_UNAVAILABLE();
						}
						try {
							return await context.social.accounts.complete(
								actorId,
								input.callbackUrl,
							);
						} catch (error) {
							throw connectRefusal(error, errors);
						}
					}),
				disconnect: impl.admin.social.disconnect
					.use(isAdmin)
					.handler(async ({ context, input, errors }) => {
						if (!context.social?.accounts) {
							throw errors.SERVICE_UNAVAILABLE();
						}
						const removed = await context.social.accounts.disconnect(
							input.platform,
							actorOf(context.session),
						);
						if (!removed) {
							throw errors.NOT_FOUND();
						}
						return { success: true };
					}),
				publish: impl.admin.social.publish
					.use(isAdmin)
					.handler(async ({ context, input, errors }) => {
						const actorId = actorOf(context.session);
						await consume(socialLimiter, actorId);
						const outcome = await publishShare(
							{
								store: createSocialPostStore(context.db),
								publisher: context.social?.publisher ?? null,
								siteUrl: context.social?.siteUrl,
								loadTarget: createShareTargetLoader(context.db),
							},
							actorId,
							input,
						);
						if (!outcome.ok) {
							if (outcome.code === "UNAVAILABLE") {
								throw errors.SERVICE_UNAVAILABLE();
							}
							if (outcome.code === "NOT_FOUND") {
								throw errors.NOT_FOUND();
							}
							throw errors.CONFLICT({ message: outcome.message });
						}
						return outcome.publication;
					}),
			},
			watch: createWatchAdminHandlers(),
			organizations: createOrganizationsAdminHandlers(),
			webVitals: {
				byCountry: impl.admin.webVitals.byCountry
					.use(isAdmin)
					.handler(({ context, input }) =>
						webVitalsByCountry(context.db, input.days),
					),
			},
			reputationFlags: {
				list: impl.admin.reputationFlags.list
					.use(isAdmin)
					.handler(async ({ context, input, errors }) => {
						const position = input.cursor ? decodeCursor(input.cursor) : null;
						if (input.cursor && !position) {
							throw errors.BAD_REQUEST({
								data: {
									issues: [{ path: ["cursor"], message: "Invalid cursor" }],
								},
							});
						}
						const voter = alias(user, "voter");
						const author = alias(user, "author");
						const rows = await context.db
							.select({
								event: reputationEvents,
								voterName: voter.name,
								authorName: author.name,
							})
							.from(reputationEvents)
							.innerJoin(voter, eq(voter.id, reputationEvents.actorId))
							.innerJoin(author, eq(author.id, reputationEvents.userId))
							.where(
								and(
									eq(
										reputationEvents.voidedReason,
										input.reason ?? "repeat_voter",
									),
									position
										? or(
												lt(reputationEvents.createdAt, position.createdAt),
												and(
													eq(reputationEvents.createdAt, position.createdAt),
													lt(reputationEvents.id, position.id),
												),
											)
										: undefined,
								),
							)
							.orderBy(
								desc(reputationEvents.createdAt),
								desc(reputationEvents.id),
							)
							.limit(input.limit + 1);
						const page = rows.slice(0, input.limit);
						const last = page.at(-1)?.event;
						return {
							items: page.map(({ event, voterName, authorName }) => ({
								id: event.id,
								// Non-null: the query filters on a reason.
								reason: event.voidedReason ?? "repeat_voter",
								cause: event.cause,
								points: event.points,
								kind: event.kind,
								voter: { id: event.actorId, name: voterName },
								author: { id: event.userId, name: authorName },
								targetType: event.targetType,
								targetId: event.targetId,
								createdAt: event.createdAt.toISOString(),
							})),
							nextCursor:
								rows.length > input.limit && last
									? encodeCursor(last.createdAt, last.id)
									: null,
						};
					}),
			},
			auditLog: {
				list: impl.admin.auditLog.list
					.use(isAdmin)
					.handler(async ({ context, input, errors }) => {
						const position = input.cursor ? decodeCursor(input.cursor) : null;
						if (input.cursor && !position) {
							throw errors.BAD_REQUEST({
								data: {
									issues: [{ path: ["cursor"], message: "Invalid cursor" }],
								},
							});
						}
						const rows = await context.db
							.select()
							.from(auditLog)
							.where(
								and(
									input.action ? eq(auditLog.action, input.action) : undefined,
									input.actorId
										? eq(auditLog.actorId, input.actorId)
										: undefined,
									input.targetType
										? eq(auditLog.targetType, input.targetType)
										: undefined,
									position
										? or(
												lt(auditLog.createdAt, position.createdAt),
												and(
													eq(auditLog.createdAt, position.createdAt),
													lt(auditLog.id, position.id),
												),
											)
										: undefined,
								),
							)
							.orderBy(desc(auditLog.createdAt), desc(auditLog.id))
							.limit(input.limit + 1);
						const page = rows.slice(0, input.limit);
						const last = page.at(-1);
						return {
							items: page.map((row) => ({
								id: row.id,
								actorId: row.actorId,
								action: row.action,
								targetType: row.targetType,
								targetId: row.targetId,
								details: row.details ?? null,
								createdAt: row.createdAt.toISOString(),
							})),
							nextCursor:
								rows.length > input.limit && last
									? encodeCursor(last.createdAt, last.id)
									: null,
						};
					}),
			},
			agents: {
				reactivate: impl.admin.agents.reactivate
					.use(isAdmin)
					.handler(async ({ context, input, errors }) => {
						const actorId = context.session?.user.id;
						if (!actorId) {
							throw errors.UNAUTHORIZED();
						}
						try {
							await createAgentService(
								context.db,
								context.agentRules,
							).reactivate(actorId, input.id);
							return { success: true };
						} catch (err) {
							if (err instanceof AgentError) {
								throw errors.NOT_FOUND();
							}
							throw err;
						}
					}),
			},
			questions: {
				remove: impl.admin.questions.remove
					.use(isAdmin)
					.handler(async ({ context, input, errors }) => {
						const actorId = context.session?.user.id;
						if (!actorId) {
							throw errors.UNAUTHORIZED();
						}
						try {
							// The isAdmin middleware admits staff only, so the actor is staff here.
							return await createQuestionService(context.db).removeQuestion(
								{ id: actorId, isStaff: true },
								input.id,
								input.expectedVersion,
							);
						} catch (err) {
							if (err instanceof QuestionError) {
								if (err.code === "NOT_FOUND") throw errors.NOT_FOUND();
								if (err.code === "FORBIDDEN") throw errors.FORBIDDEN();
								if (err.code === "CONFLICT") {
									throw errors.CONFLICT({
										data: { version: err.currentVersion ?? 0 },
									});
								}
							}
							throw err;
						}
					}),
			},
		},
		tags: {
			search: impl.tags.search.handler(async ({ context, input }) => ({
				items: await searchTags(
					context.db,
					{ q: input.q?.trim().toLowerCase() || undefined, limit: input.limit },
					context.session?.user.id ?? null,
				),
			})),
			followed: impl.tags.followed.handler(async ({ context }) => {
				const userId = actorOf(context.session);
				return { items: await followedTags(context.db, userId) };
			}),
			follow: impl.tags.follow.handler(async ({ context, input, errors }) => {
				const userId = actorOf(context.session);
				const tag = await followTag(context.db, userId, input.tag);
				if (!tag) {
					throw errors.NOT_FOUND();
				}
				return tag;
			}),
			skipOnboarding: impl.tags.skipOnboarding.handler(async ({ context }) => {
				await skipTagsOnboarding(context.db, actorOf(context.session));
				return { success: true };
			}),
			unfollow: impl.tags.unfollow.handler(async ({ context, input }) => {
				const userId = actorOf(context.session);
				await unfollowTag(context.db, userId, input.tag);
				return { success: true };
			}),
		},
		markdown: {
			preview: impl.markdown.preview.handler(({ context, input, errors }) => {
				if (!context.session) {
					throw errors.UNAUTHORIZED();
				}
				return { html: sanitizeMarkdown(input.body).html };
			}),
		},
		agents: createAgentsHandlers(),
		answers: createAnswersHandlers(),
		questions: createQuestionsHandlers(),
		votes: createVotesHandlers(),
		feed: { ...createFeedHandlers(), ...createMixedFeedHandlers() },
		rankings: createRankingsHandlers(),
		watch: createWatchHandlers(),
		organizations: createOrganizationsHandlers(),
		community: {
			snapshot: impl.community.snapshot.handler(async ({ context }) => {
				const { day, computedAt, figures } = await communitySnapshot(
					context.db,
				);
				return { day, computedAt, ...figures };
			}),
		},
	});

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterContractClient<typeof contract>;
