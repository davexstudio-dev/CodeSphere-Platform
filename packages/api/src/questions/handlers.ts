import { notifyAgentPaused, type PausedAgent } from "../agents/service";
import { AnswerError, createAnswerService } from "../answers/service";
import { requireAdmin } from "../authorization";
import type { Context } from "../context";
import { createMixedFeedService } from "../feed-mixed/service";
import { impl } from "../index";
import { PrivilegeError } from "../reputation/service";
import {
	createPostgresSearchIndex,
	decodeSearchCursor,
	encodeSearchCursor,
	InvalidSearchCursorError,
	MIN_TITLE_LENGTH,
} from "../search/service";
import { createVoteService, VoteError } from "../votes/service";
import { defaultWriteQuota } from "../write-quota";
import { authorsById, UNKNOWN_AUTHOR, votesOf } from "./authors";
import { createListingService, InvalidCursorError } from "./listing";
import { createQuestionService, QuestionError } from "./service";

/** What a vote needs to moderate Agents (#245): the rules, and who to tell when one is paused. */
function agentHooks(context: Context) {
	return {
		rules: context.agentRules,
		onPaused: (paused: PausedAgent) =>
			notifyAgentPaused(
				context.db,
				paused,
				context.notifications,
				context.logger,
			),
	};
}

/** The signed-in user as the write quota sees them: an Agent only if its row says so. */
function actorOf(
	sessionUser: { id: string; kind?: unknown; ownerId?: unknown } | undefined,
) {
	const agent = sessionUser?.kind === "agent";
	return {
		id: sessionUser?.id ?? "",
		kind: agent ? ("agent" as const) : ("human" as const),
		ownerId:
			agent && typeof sessionUser?.ownerId === "string"
				? sessionUser.ownerId
				: null,
	};
}

// Each request builds its service from the request's database (context.db), as the other routers do.
export function createQuestionsHandlers() {
	return {
		create: impl.questions.create.handler(
			async ({ context, input, errors }) => {
				const userId = context.session?.user.id;
				if (!userId) {
					throw errors.UNAUTHORIZED();
				}

				// Counted before the write, replays included: 10 an hour for a Member (#72), 5 a day
				// for an Agent and a shared quota per Owner (#246).
				await (context.writeQuota ?? defaultWriteQuota).consume(
					actorOf(context.session?.user),
					"question",
				);

				try {
					return await createQuestionService(context.db).createQuestion(
						userId,
						input,
					);
				} catch (err) {
					if (err instanceof QuestionError && err.code === "VALIDATION") {
						throw errors.BAD_REQUEST({
							data: {
								issues: [{ path: ["tags"], message: "Tags must be 1–5" }],
							},
						});
					}
					throw err;
				}
			},
		),

		list: impl.questions.list.handler(async ({ context, input, errors }) => {
			try {
				return await createListingService(context.db).list(input);
			} catch (err) {
				if (err instanceof InvalidCursorError) {
					throw errors.BAD_REQUEST({
						data: {
							issues: [{ path: ["cursor"], message: "Invalid cursor" }],
						},
					});
				}
				throw err;
			}
		}),

		search: impl.questions.search.handler(
			async ({ context, input, errors }) => {
				let offset: number;
				try {
					offset = decodeSearchCursor(input.cursor);
				} catch (err) {
					if (err instanceof InvalidSearchCursorError) {
						throw errors.BAD_REQUEST({
							data: {
								issues: [{ path: ["cursor"], message: "Invalid cursor" }],
							},
						});
					}
					throw err;
				}
				const index =
					context.searchIndex ?? createPostgresSearchIndex(context.db);
				// One more than the page, to know whether another page follows.
				const ids = await index.search({
					text: input.q,
					language: input.language,
					limit: input.limit + 1,
					offset,
				});
				const items = await createListingService(context.db).byIds(
					ids.slice(0, input.limit),
				);
				return {
					items,
					// More results exist; the page itself can be short when a result was removed since the
					// index returned it, so a client follows the cursor, not the page size.
					nextCursor:
						ids.length > input.limit
							? encodeSearchCursor(offset + input.limit)
							: null,
				};
			},
		),

		similar: impl.questions.similar.handler(async ({ context, input }) => {
			const index =
				context.searchIndex ?? createPostgresSearchIndex(context.db);
			// What is typed never fails the form: too short a title, or an engine error, is no result.
			if (input.title.length < MIN_TITLE_LENGTH) {
				return { items: [] };
			}
			try {
				const ids = await index.similarTitles({ title: input.title, limit: 5 });
				return { items: await createListingService(context.db).byIds(ids) };
			} catch (error) {
				context.logger.warn({ err: error }, "similar titles failed");
				return { items: [] };
			}
		}),

		get: impl.questions.get.handler(async ({ context, input, errors }) => {
			try {
				const question = await createQuestionService(context.db).getQuestion(
					input.id,
				);
				const [extras, mine] = await Promise.all([
					createListingService(context.db).extrasFor([question]),
					votesOf(context.db, context.session?.user.id ?? null, "question", [
						question.id,
					]),
				]);
				return {
					...question,
					...(extras.get(question.id) ?? {
						...UNKNOWN_AUTHOR,
						answerCount: 0,
					}),
					myVote: mine.get(question.id) ?? null,
				};
			} catch (err) {
				if (err instanceof QuestionError && err.code === "NOT_FOUND") {
					throw errors.NOT_FOUND();
				}
				throw err;
			}
		}),

		update: impl.questions.update.handler(
			async ({ context, input, errors }) => {
				const userId = context.session?.user.id;
				if (!userId) {
					throw errors.UNAUTHORIZED();
				}

				try {
					return await createQuestionService(context.db).updateQuestion(
						userId,
						input,
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
			},
		),

		close: impl.questions.close.handler(async ({ context, input, errors }) => {
			const userId = context.session?.user.id;
			if (!userId) {
				throw errors.UNAUTHORIZED();
			}

			try {
				return await createQuestionService(context.db).closeQuestion(
					{ id: userId, isStaff: requireAdmin(context.session).ok },
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

		reopen: impl.questions.reopen.handler(
			async ({ context, input, errors }) => {
				const userId = context.session?.user.id;
				if (!userId) {
					throw errors.UNAUTHORIZED();
				}

				try {
					return await createQuestionService(context.db).reopenQuestion(
						{ id: userId, isStaff: requireAdmin(context.session).ok },
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
			},
		),

		delete: impl.questions.delete.handler(
			async ({ context, input, errors }) => {
				const userId = context.session?.user.id;
				if (!userId) {
					throw errors.UNAUTHORIZED();
				}

				try {
					return await createQuestionService(context.db).softDeleteQuestion(
						userId,
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
			},
		),
	};
}

// The For You feed is for humans (spec §2): a visitor is UNAUTHORIZED and an Agent FORBIDDEN.
export function createFeedHandlers() {
	return {
		forYou: impl.feed.forYou.handler(async ({ context, input, errors }) => {
			const user = context.session?.user as
				| { id: string; kind?: string }
				| undefined;
			if (!user) {
				throw errors.UNAUTHORIZED();
			}
			if (user.kind !== "human") {
				throw errors.FORBIDDEN();
			}
			try {
				return await createListingService(context.db).forYou(user.id, input);
			} catch (err) {
				if (err instanceof InvalidCursorError) {
					throw errors.BAD_REQUEST({
						data: {
							issues: [{ path: ["cursor"], message: "Invalid cursor" }],
						},
					});
				}
				throw err;
			}
		}),
	};
}

export function createAnswersHandlers() {
	return {
		list: impl.answers.list.handler(async ({ context, input, errors }) => {
			try {
				const { items } = await createAnswerService(
					context.db,
					context.farmingLimits,
				).list(input.questionId);
				const ids = items.map((a) => a.id);
				const [authors, mine] = await Promise.all([
					authorsById(
						context.db,
						items.map((a) => a.authorId),
					),
					votesOf(context.db, context.session?.user.id ?? null, "answer", ids),
				]);
				return {
					items: items.map((a) => {
						const { authorName, authorKind, ownerName, authorReputation } =
							authors.get(a.authorId) ?? UNKNOWN_AUTHOR;
						return {
							...a,
							authorName,
							authorKind,
							ownerName,
							authorReputation,
							myVote: mine.get(a.id) ?? null,
						};
					}),
				};
			} catch (err) {
				if (err instanceof AnswerError && err.code === "NOT_FOUND") {
					throw errors.NOT_FOUND();
				}
				throw err;
			}
		}),

		create: impl.answers.create.handler(async ({ context, input, errors }) => {
			const userId = context.session?.user.id;
			if (!userId) {
				throw errors.UNAUTHORIZED();
			}
			// 30 an hour for a Member (#72), 20 a day for an Agent, and the Owner's shared quota.
			await (context.writeQuota ?? defaultWriteQuota).consume(
				actorOf(context.session?.user),
				"answer",
			);
			try {
				return await createAnswerService(
					context.db,
					context.farmingLimits,
				).create(userId, input);
			} catch (err) {
				if (err instanceof AnswerError) {
					if (err.code === "NOT_FOUND") throw errors.NOT_FOUND();
					if (err.code === "CONFLICT") throw errors.CONFLICT();
				}
				throw err;
			}
		}),

		update: impl.answers.update.handler(async ({ context, input, errors }) => {
			const userId = context.session?.user.id;
			if (!userId) {
				throw errors.UNAUTHORIZED();
			}
			try {
				return await createAnswerService(
					context.db,
					context.farmingLimits,
				).update(userId, input);
			} catch (err) {
				throw answerRefusal(err, errors);
			}
		}),

		delete: impl.answers.delete.handler(async ({ context, input, errors }) => {
			const userId = context.session?.user.id;
			if (!userId) {
				throw errors.UNAUTHORIZED();
			}
			try {
				return await createAnswerService(
					context.db,
					context.farmingLimits,
				).remove(userId, input);
			} catch (err) {
				throw answerRefusal(err, errors);
			}
		}),

		accept: impl.answers.accept.handler(async ({ context, input, errors }) => {
			const userId = context.session?.user.id;
			if (!userId) {
				throw errors.UNAUTHORIZED();
			}
			try {
				return await createAnswerService(
					context.db,
					context.farmingLimits,
				).accept(userId, input.id);
			} catch (err) {
				if (err instanceof AnswerError) {
					if (err.code === "NOT_FOUND") throw errors.NOT_FOUND();
					if (err.code === "FORBIDDEN") throw errors.FORBIDDEN();
				}
				throw err;
			}
		}),
	};
}

// The typed refusal of a stale or forbidden answer write; anything else is not ours.
function answerRefusal(
	err: unknown,
	errors: {
		NOT_FOUND: () => Error;
		FORBIDDEN: () => Error;
		CONFLICT: (options: { data: { version: number } }) => Error;
	},
) {
	if (err instanceof AnswerError) {
		if (err.code === "NOT_FOUND") return errors.NOT_FOUND();
		if (err.code === "FORBIDDEN") return errors.FORBIDDEN();
		return errors.CONFLICT({ data: { version: err.currentVersion ?? 0 } });
	}
	return err;
}

// Votes are for humans (spec §2): a visitor is UNAUTHORIZED and an Agent FORBIDDEN.
export function createVotesHandlers() {
	const voter = (
		context: { session: { user: { id: string } } | null },
		errors: { UNAUTHORIZED: () => Error; FORBIDDEN: () => Error },
	) => {
		const user = context.session?.user as
			| { id: string; kind?: string }
			| undefined;
		if (!user) {
			throw errors.UNAUTHORIZED();
		}
		if (user.kind !== "human") {
			throw errors.FORBIDDEN();
		}
		return user.id;
	};
	const refusal = (
		err: unknown,
		errors: { NOT_FOUND: () => Error; FORBIDDEN: () => Error },
	) => {
		if (err instanceof VoteError) {
			return err.code === "NOT_FOUND" ? errors.NOT_FOUND() : errors.FORBIDDEN();
		}
		return err;
	};

	return {
		cast: impl.votes.cast.handler(async ({ context, input, errors }) => {
			const userId = voter(context, errors);
			// Re-sending an upvote already counted teaches the feed nothing more.
			const feed = createMixedFeedService(context.db, context.feedRanking);
			const alreadyUp =
				input.value === "up" && input.targetType === "question"
					? await feed.hasUpvoted(userId, input.targetId).catch(() => false)
					: true;
			try {
				const result = await createVoteService(
					context.db,
					context.privilegeThresholds,
					context.farmingLimits,
					agentHooks(context),
				).cast(
					userId,
					{ targetType: input.targetType, targetId: input.targetId },
					input.value,
				);
				if (
					input.value === "up" &&
					input.targetType === "question" &&
					!alreadyUp
				) {
					// An upvote teaches the « Pour toi » feed the Question's Tags; it never fails the vote.
					await feed
						.learnFromQuestion(userId, input.targetId)
						.catch((error) =>
							context.logger.warn({ err: error }, "feed learning failed"),
						);
				}
				return result;
			} catch (err) {
				if (err instanceof PrivilegeError) {
					throw errors.PRIVILEGE_REQUIRED({
						data: {
							privilege: err.privilege,
							required: err.required,
							current: err.current,
						},
					});
				}
				throw refusal(err, errors);
			}
		}),

		retract: impl.votes.retract.handler(async ({ context, input, errors }) => {
			const userId = voter(context, errors);
			try {
				return await createVoteService(
					context.db,
					context.privilegeThresholds,
					context.farmingLimits,
					agentHooks(context),
				).retract(userId, input);
			} catch (err) {
				throw refusal(err, errors);
			}
		}),
	};
}
