import type { Database } from "@codesphere/db";
import { type SocialPostState, socialPost } from "@codesphere/db/schema/social";
import {
	type PublishReport,
	SocialAuthError,
	type SocialPlatform,
	type SocialPublisher,
	SocialSignInError,
} from "@codesphere/social";
import { and, desc, eq, lt, sql } from "drizzle-orm";

import { withAudit } from "./audit";
import { loadHackathons } from "./hackathons";
import { outboxInsert } from "./outbox/events";
import { authorsById } from "./questions/authors";
import { createQuestionService, QuestionError } from "./questions/service";

/**
 * Publishing a public page to CodeSphere's own social accounts (#265, ADR 0001).
 *
 * The `social_post` row is the lock: it is claimed BEFORE anything is sent, so two clicks or a retry
 * can never post twice. The claim writes an outbox event in the same statement; the consumer sends
 * the post (`sendShare`). A row left `sending` or `unknown` means the platform may hold the post:
 * it is never sent again blindly. Only a failure that provably sent nothing is retryable.
 */

export type ShareType = "question" | "hackathon";
export type SharePlatform = SocialPlatform;

export type ShareInput = {
	type: ShareType;
	id: string;
	platform: SharePlatform;
	text?: string;
};

export type SocialPostRow = {
	targetType: ShareType;
	targetId: string;
	platform: SharePlatform;
	state: SocialPostState;
	postUrl: string | null;
	message: string | null;
	retryable: boolean;
};

export type Publication = {
	platform: SharePlatform;
	type: ShareType;
	id: string;
	state: Exclude<SocialPostState, "sending">;
	postUrl: string | null;
	message: string | null;
	retryable: boolean;
};

/** A post about to leave. */
export type ClaimedPost = Pick<
	SocialPostRow,
	"targetType" | "targetId" | "platform"
> & { text: string };

/** What is stored per post; the Postgres implementation is below, tests use a memory one. */
export interface SocialPostStore {
	/** Claims the key for a new post. Null when a row already holds it. */
	claim(input: {
		key: string;
		actorId: string;
		text: string;
		input: ShareInput;
	}): Promise<boolean>;
	find(key: string): Promise<SocialPostRow | null>;
	/** Atomically moves a retryable `failed` row back to `pending`. False when it was not one. */
	reclaim(key: string, actorId: string): Promise<boolean>;
	/** Atomically moves a `pending` row to `sending`. Null when it was not one. */
	begin(key: string): Promise<ClaimedPost | null>;
	finish(
		key: string,
		patch: Pick<SocialPostRow, "state" | "postUrl" | "message" | "retryable">,
	): Promise<void>;
}

/** The public page behind a share, or why it cannot be shared. */
export type ShareTarget =
	| { ok: true; title: string; path: string }
	| { ok: false; reason: "not-found" | "agent-content" };

export type ShareDeps = {
	store: SocialPostStore;
	publisher: SocialPublisher | null;
	/** Public origin of the web app, e.g. https://codesphereplatform.xyz */
	siteUrl: string | undefined;
	loadTarget(type: ShareType, id: string): Promise<ShareTarget>;
};

export type ShareOutcome =
	| { ok: true; publication: Publication }
	| {
			ok: false;
			code: "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE";
			message: string;
	  };

export const shareKey = (input: Pick<ShareInput, "type" | "id" | "platform">) =>
	`share:${input.type}:${input.id}:${input.platform}`;

const toPublication = (row: SocialPostRow): Publication => ({
	platform: row.platform,
	type: row.targetType,
	id: row.targetId,
	// `sending` is still in progress for the Admin, until it ends or `settleStalePosts` calls it unknown.
	state: row.state === "sending" ? "pending" : row.state,
	postUrl: row.postUrl,
	message: row.message,
	retryable: row.retryable,
});

/** One report from the publisher, the worst one when several (a state that may hold a post wins). */
function settle(
	reports: PublishReport[],
): Pick<SocialPostRow, "state" | "postUrl" | "message" | "retryable"> {
	const order = [
		"unknown",
		"processing",
		"failed",
		"not-submitted",
		"published",
	];
	const report = [...reports].sort(
		(a, b) => order.indexOf(a.state) - order.indexOf(b.state),
	)[0];
	if (!report) {
		return { state: "unknown", postUrl: null, message: null, retryable: false };
	}
	if (report.state === "published") {
		return {
			state: "published",
			postUrl: report.url ?? null,
			message: null,
			retryable: false,
		};
	}
	if (report.state === "processing" || report.state === "unknown") {
		return {
			state: report.state,
			postUrl: null,
			message: report.message ?? null,
			retryable: false,
		};
	}
	// failed / not-submitted: nothing is known to be on the platform; retry only if the SDK says so.
	return {
		state: "failed",
		postUrl: null,
		message: report.message ?? null,
		retryable: report.retryable ?? false,
	};
}

export async function publishShare(
	deps: ShareDeps,
	actorId: string,
	input: ShareInput,
): Promise<ShareOutcome> {
	const { publisher, siteUrl } = deps;
	if (!publisher || !siteUrl || !publisher.platforms.includes(input.platform)) {
		return {
			ok: false,
			code: "UNAVAILABLE",
			message: "Social publishing is not configured for this platform.",
		};
	}

	const key = shareKey(input);
	// A repeated call on a finished post answers with it, without touching the platform.
	const existing = await deps.store.find(key);
	if (existing?.state === "published") {
		return { ok: true, publication: toPublication(existing) };
	}

	const target = await deps.loadTarget(input.type, input.id);
	if (!target.ok) {
		return target.reason === "not-found"
			? { ok: false, code: "NOT_FOUND", message: "Nothing public to share." }
			: {
					ok: false,
					code: "CONFLICT",
					message: "Content written by an Agent is not shared.",
				};
	}

	const text = input.text ?? target.title;
	const claimed = existing
		? await deps.store.reclaim(key, actorId)
		: await deps.store.claim({ key, actorId, text, input });
	if (!claimed) {
		// Lost the race, or a post that may already be on the platform.
		const current = await deps.store.find(key);
		if (current?.state === "published") {
			return { ok: true, publication: toPublication(current) };
		}
		return {
			ok: false,
			code: "CONFLICT",
			message:
				"This post is in progress or its outcome is unknown; check the account before publishing again.",
		};
	}

	const row = await deps.store.find(key);
	return {
		ok: true,
		publication: toPublication(
			row ?? {
				targetType: input.type,
				targetId: input.id,
				platform: input.platform,
				state: "pending",
				postUrl: null,
				message: null,
				retryable: false,
			},
		),
	};
}

/**
 * Sends a claimed post: the outbox's consumer calls it. The queue delivers at least once, so the
 * row moves from `pending` to `sending` BEFORE anything leaves: a second delivery finds nothing to
 * take, and a crash mid-send leaves a post nobody re-sends. Returns null when there was nothing to take.
 */
export async function sendShare(
	deps: ShareDeps,
	key: string,
): Promise<Publication | null> {
	const post = await deps.store.begin(key);
	if (!post) {
		return null;
	}
	const finish = async (
		outcome: Pick<SocialPostRow, "state" | "postUrl" | "message" | "retryable">,
	) => {
		await deps.store.finish(key, outcome);
		return toPublication({ ...post, ...outcome });
	};
	const { publisher, siteUrl } = deps;
	if (!publisher || !siteUrl || !publisher.platforms.includes(post.platform)) {
		return finish({
			state: "failed",
			postUrl: null,
			message: "Social publishing is not configured for this platform.",
			retryable: true,
		});
	}
	// Read again: the content may have been deleted since the Admin asked.
	const target = await deps.loadTarget(post.targetType, post.targetId);
	if (!target.ok) {
		return finish({
			state: "failed",
			postUrl: null,
			message: "This content is no longer public.",
			retryable: false,
		});
	}

	let outcome: ReturnType<typeof settle>;
	try {
		const reports = await publisher.publish(
			{
				text: post.text,
				url: `${siteUrl.replace(/\/$/, "")}${target.path}`,
				idempotencyKey: key,
			},
			post.platform,
		);
		outcome = settle(reports);
		if (reports.some((report) => report.authFailure)) {
			outcome = {
				...outcome,
				message: "The platform refused the account's token; connect it again.",
			};
		}
	} catch (error) {
		// Only a sign-in failure proves nothing was sent. Anything else: the post may be live.
		outcome =
			error instanceof SocialSignInError
				? {
						state: "failed",
						postUrl: null,
						// Nothing was sent: an auth failure is never shown as published, and the message
						// tells the Admin what to do (it carries no token nor provider response).
						message:
							error instanceof SocialAuthError
								? error.message
								: "The social account refused the sign-in.",
						retryable: true,
					}
				: {
						state: "unknown",
						postUrl: null,
						message: "The platform did not answer; check the account.",
						retryable: false,
					};
	}
	return finish(outcome);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The public page of a Question or a Hackathon; never a deleted one nor an Agent's. */
export function createShareTargetLoader(db: Database) {
	return async (type: ShareType, id: string): Promise<ShareTarget> => {
		if (type === "hackathon") {
			const [hackathon] = await loadHackathons(db, { slug: id }, 1);
			return hackathon
				? {
						ok: true,
						title: hackathon.name,
						path: `/hackathons/${encodeURIComponent(hackathon.slug)}`,
					}
				: { ok: false, reason: "not-found" };
		}
		if (!UUID.test(id)) {
			return { ok: false, reason: "not-found" };
		}
		try {
			const question = await createQuestionService(db).getQuestion(id);
			const author = (await authorsById(db, [question.authorId])).get(
				question.authorId,
			);
			if (author?.authorKind === "agent") {
				return { ok: false, reason: "agent-content" };
			}
			return {
				ok: true,
				title: question.title,
				path: `/questions/${encodeURIComponent(question.id)}`,
			};
		} catch (error) {
			if (error instanceof QuestionError && error.code === "NOT_FOUND") {
				return { ok: false, reason: "not-found" };
			}
			throw error;
		}
	};
}

const columns = {
	targetType: socialPost.targetType,
	targetId: socialPost.targetId,
	platform: socialPost.platform,
	state: socialPost.state,
	postUrl: socialPost.postUrl,
	message: socialPost.message,
	retryable: socialPost.retryable,
};

/** The event that hands a claimed post to the consumer. */
export const SOCIAL_PUBLISH_REQUESTED = "social.publish_requested";

const requestedEvent = (key: string) =>
	outboxInsert({
		type: SOCIAL_PUBLISH_REQUESTED,
		aggregateType: "social_post",
		aggregateIdColumn: "id",
		payload: { key },
	});

/** Postgres store. Each step is one statement (the Worker's HTTP driver has no transactions). */
export function createSocialPostStore(db: Database): SocialPostStore {
	return {
		async claim({ key, actorId, text, input }) {
			const rows = await withAudit(
				db,
				{
					actorId,
					action: "social.publish",
					targetType: input.type,
					targetId: input.id,
					details: { fields: [input.platform] },
				},
				db
					.insert(socialPost)
					.values({
						idempotencyKey: key,
						targetType: input.type,
						targetId: input.id,
						platform: input.platform,
						state: "pending",
						text,
						requestedBy: actorId,
					})
					.onConflictDoNothing()
					.returning({ id: socialPost.id }),
				[requestedEvent(key)],
			);
			return rows.length === 1;
		},
		async find(key) {
			const [row] = await db
				.select(columns)
				.from(socialPost)
				.where(eq(socialPost.idempotencyKey, key));
			return row ?? null;
		},
		async reclaim(key, actorId) {
			const rows = await withAudit(
				db,
				{
					actorId,
					action: "social.retry",
					targetType: "social_post",
					targetIdColumn: "id",
				},
				db
					.update(socialPost)
					.set({
						state: "pending",
						message: null,
						retryable: false,
						requestedBy: actorId,
						updatedAt: sql`now()`,
					})
					.where(
						and(
							eq(socialPost.idempotencyKey, key),
							eq(socialPost.state, "failed"),
							eq(socialPost.retryable, true),
						),
					)
					.returning({ id: socialPost.id }),
				[requestedEvent(key)],
			);
			return rows.length === 1;
		},
		async begin(key) {
			const [row] = await db
				.update(socialPost)
				.set({ state: "sending", updatedAt: sql`now()` })
				.where(
					and(
						eq(socialPost.idempotencyKey, key),
						eq(socialPost.state, "pending"),
					),
				)
				.returning({
					targetType: socialPost.targetType,
					targetId: socialPost.targetId,
					platform: socialPost.platform,
					text: socialPost.text,
				});
			return row ?? null;
		},
		async finish(key, patch) {
			await db
				.update(socialPost)
				.set({ ...patch, updatedAt: sql`now()` })
				.where(eq(socialPost.idempotencyKey, key));
		},
	};
}

/** How long a post may wait or be sent before the back-office stops calling it in progress. */
const STALE_POST = sql`now() - interval '15 minutes'`;

/**
 * Ends the posts nothing will finish. One still `pending` never left (no queue, a stopped relay):
 * publishing again is safe, and `begin` no longer takes it. One still `sending` may be live: it
 * becomes `unknown` and is never re-sent.
 */
export async function settleStalePosts(db: Database) {
	await db
		.update(socialPost)
		.set({
			state: "failed",
			message: "The post was never sent; publish it again.",
			retryable: true,
			updatedAt: sql`now()`,
		})
		.where(
			and(
				eq(socialPost.state, "pending"),
				lt(socialPost.updatedAt, STALE_POST),
			),
		);
	await db
		.update(socialPost)
		.set({
			state: "unknown",
			message: "The send did not finish; check the account.",
			updatedAt: sql`now()`,
		})
		.where(
			and(
				eq(socialPost.state, "sending"),
				lt(socialPost.updatedAt, STALE_POST),
			),
		);
}

/** The latest posts, for the back-office to follow what became of them. */
export async function recentPosts(db: Database, limit = 20) {
	await settleStalePosts(db);
	const rows = await db
		.select({
			...columns,
			text: socialPost.text,
			updatedAt: socialPost.updatedAt,
		})
		.from(socialPost)
		.orderBy(desc(socialPost.createdAt))
		.limit(limit);
	return rows.map((row) => ({
		...toPublication(row),
		text: row.text,
		updatedAt: row.updatedAt.toISOString(),
	}));
}
