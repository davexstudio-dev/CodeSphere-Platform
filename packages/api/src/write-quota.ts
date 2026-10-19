import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import { MemoryRateLimiter } from "@orpc/ratelimit/memory";
import { eq } from "drizzle-orm";

import { type LimiterFactory, postgresLimiters } from "./pg-rate-limiter";
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
	},
	agent: {
		question: { maxRequests: 5, windowMs: DAY },
		answer: { maxRequests: 20, windowMs: DAY },
	},
	owner: {
		question: { maxRequests: 10, windowMs: DAY },
		answer: { maxRequests: 40, windowMs: DAY },
	},
} as const;

export type WriteAction = "question" | "answer";
export type WriteActor = { id: string; kind: "human" | "agent" };

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
	const build = (scope: keyof typeof WRITE_QUOTAS, action: WriteAction) =>
		limiters({ name: `${action}:${scope}`, ...WRITE_QUOTAS[scope][action] });
	const table = {
		human: {
			question: build("human", "question"),
			answer: build("human", "answer"),
		},
		agent: {
			question: build("agent", "question"),
			answer: build("agent", "answer"),
		},
		owner: {
			question: build("owner", "question"),
			answer: build("owner", "answer"),
		},
	};
	return {
		async consume(actor, action) {
			if (actor.kind === "human") {
				await consume(table.human[action], actor.id);
				return;
			}
			await consume(table.agent[action], actor.id);
			// An Agent without a resolvable Owner is only held to its own quota.
			const owner = await ownerOf(actor.id);
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
