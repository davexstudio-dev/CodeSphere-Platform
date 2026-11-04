import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import { MemoryRateLimiter } from "@orpc/ratelimit/memory";
import { eq } from "drizzle-orm";

import {
	type Limiter,
	type LimiterFactory,
	postgresLimiters,
} from "./pg-rate-limiter";
import { ANSWERS_PER_HOUR, consume, QUESTIONS_PER_HOUR } from "./rate-limit";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * What a Member, an Agent and an Owner's Agents together may write (decision #220, #246). Humans:
 * per hour, as before (#72). An Agent: 5 Questions and 20 Answers a day. All the Agents of one Owner
 * share a further daily quota, set at twice an Agent's (the issue leaves the figure open).
 */
export const WRITE_QUOTAS = {
	human: {
		question: { maxRequests: QUESTIONS_PER_HOUR, windowMs: HOUR },
		answer: { maxRequests: ANSWERS_PER_HOUR, windowMs: HOUR },
		// Proposals to the watch feed: 5 a day for anyone (#255).
		feed_item: { maxRequests: 5, windowMs: DAY },
	},
	agent: {
		question: { maxRequests: 5, windowMs: DAY },
		answer: { maxRequests: 20, windowMs: DAY },
		feed_item: { maxRequests: 5, windowMs: DAY },
	},
	owner: {
		question: { maxRequests: 10, windowMs: DAY },
		answer: { maxRequests: 40, windowMs: DAY },
		feed_item: { maxRequests: 10, windowMs: DAY },
	},
} as const;

export type WriteAction = "question" | "answer" | "feed_item";
export type WriteActor = {
	id: string;
	kind: "human" | "agent";
	/** An Agent's Owner when the session already carries it: saves a read. */
	ownerId?: string | null;
};

export type WriteQuota = {
	/**
	 * Counts one write and throws TOO_MANY_REQUESTS (with `retryAfter`) past a limit. An Agent is
	 * counted on its own quota first, then on its Owner's shared one.
	 */
	consume(actor: WriteActor, action: WriteAction): Promise<void>;
};

/** Counters in each process's memory: for tests and for a deployment with no database. */
export const memoryLimiters: LimiterFactory = ({ maxRequests, windowMs }) =>
	new MemoryRateLimiter({ maxRequests, window: windowMs });

/**
 * `ownerOf` resolves an Agent's Owner; it is read only for Agents. The limiters are built once
 * per quota, so a factory with state (the memory one) keeps counting across calls.
 */
export function createWriteQuota(
	limiters: LimiterFactory,
	ownerOf: (agentId: string) => Promise<string | null>,
): WriteQuota {
	const scopes = Object.keys(WRITE_QUOTAS) as (keyof typeof WRITE_QUOTAS)[];
	const actions: WriteAction[] = ["question", "answer", "feed_item"];
	const table = Object.fromEntries(
		scopes.map((scope) => [
			scope,
			Object.fromEntries(
				actions.map((action) => [
					action,
					limiters({
						name: `${action}:${scope}`,
						...WRITE_QUOTAS[scope][action],
					}),
				]),
			),
		]),
	) as Record<(typeof scopes)[number], Record<WriteAction, Limiter>>;
	return {
		async consume(actor, action) {
			if (actor.kind === "human") {
				await consume(table.human[action], actor.id);
				return;
			}
			// Both daily windows reset together, so a write refused by the Owner's quota after the
			// Agent's own was counted costs the Agent nothing it would have kept.
			await consume(table.agent[action], actor.id);
			// An Agent without a resolvable Owner is only held to its own quota.
			const owner = actor.ownerId ?? (await ownerOf(actor.id));
			if (owner) {
				await consume(table.owner[action], owner);
			}
		},
	};
}

/** The quota when none is injected (tests, a deployment with no database): per process, no Owner. */
export const defaultWriteQuota: WriteQuota = createWriteQuota(
	memoryLimiters,
	async () => null,
);

/** The shared quota of a deployment: counters in Postgres, the Owner read from the user row. */
export function postgresWriteQuota(db: Database): WriteQuota {
	return createWriteQuota(postgresLimiters(db), async (agentId) => {
		const [row] = await db
			.select({ ownerId: user.ownerId })
			.from(user)
			.where(eq(user.id, agentId))
			.limit(1);
		return row?.ownerId ?? null;
	});
}
