import type { Database } from "@codesphere/db";
import { answers, questions, votes } from "@codesphere/db/schema/questions";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
	type AgentRules,
	DEFAULT_AGENT_RULES,
	type PausedAgent,
	settleAgentAnswer,
} from "../agents/service";
import {
	DEFAULT_PRIVILEGE_THRESHOLDS,
	FARMING_LIMITS,
	type FarmingLimits,
	type PrivilegeThresholds,
	requirePrivilege,
	settleVote,
} from "../reputation/service";

export class VoteError extends Error {
	constructor(readonly code: "NOT_FOUND" | "FORBIDDEN") {
		super(code);
	}
}

export type VoteTarget = {
	targetType: "question" | "answer";
	targetId: string;
};

export function createVoteService(
	db: Database,
	thresholds: PrivilegeThresholds = DEFAULT_PRIVILEGE_THRESHOLDS,
	limits: FarmingLimits = FARMING_LIMITS,
	agents: {
		rules?: AgentRules;
		/** Called when this vote got an Agent paused (#245): the Owner is to be told. */
		onPaused?: (paused: PausedAgent) => Promise<void> | void;
	} = {},
) {
	// The author of a live target: a deleted or unknown one is NOT_FOUND.
	async function authorOf({ targetType, targetId }: VoteTarget) {
		const table = targetType === "question" ? questions : answers;
		const [row] = await db
			.select({ authorId: table.authorId })
			.from(table)
			.where(and(eq(table.id, targetId), isNull(table.deletedAt)))
			.limit(1);
		if (!row) {
			throw new VoteError("NOT_FOUND");
		}
		return row.authorId;
	}

	// The Score is recounted from the votes, not incremented: there is no transaction on the edge
	// database, and a recount is idempotent, so a racing vote is corrected by the next write.
	async function recount({ targetType, targetId }: VoteTarget) {
		const table = targetType === "question" ? questions : answers;
		const [row] = await db
			.update(table)
			.set({
				score: sql`(SELECT COALESCE(SUM(${votes.value}), 0)::int FROM ${votes} WHERE ${votes.targetType} = ${targetType} AND ${votes.targetId} = ${targetId})`,
			})
			.where(eq(table.id, targetId))
			.returning({ score: table.score });
		return row?.score ?? 0;
	}

	async function hasVote(voterId: string, target: VoteTarget, value: number) {
		const [row] = await db
			.select({ value: votes.value })
			.from(votes)
			.where(
				and(
					eq(votes.userId, voterId),
					eq(votes.targetType, target.targetType),
					eq(votes.targetId, target.targetId),
				),
			)
			.limit(1);
		return row?.value === value;
	}

	// An Agent's Answer whose Score changed may be rejected, and the Agent paused (#245).
	async function settleAgent(
		{ targetType, targetId }: VoteTarget,
		authorId: string,
		score: number,
	) {
		if (targetType !== "answer") {
			return;
		}
		const paused = await settleAgentAnswer(
			db,
			authorId,
			targetId,
			score,
			agents.rules ?? DEFAULT_AGENT_RULES,
		);
		if (paused) {
			await agents.onPaused?.(paused);
		}
	}

	async function guard(voterId: string, target: VoteTarget) {
		const authorId = await authorOf(target);
		if (authorId === voterId) {
			throw new VoteError("FORBIDDEN");
		}
		return authorId;
	}

	// Agents are refused before this point, by the handler: here, never one's own content.
	return {
		async cast(voterId: string, target: VoteTarget, value: "up" | "down") {
			const authorId = await guard(voterId, target);
			const signed = value === "up" ? 1 : -1;
			// Repeating a down vote already cast changes nothing, so it needs no Privilege: an
			// outbox retry after the Member dropped below the threshold must not be refused. (The
			// check and the write are not atomic: the edge database has no transaction, so a burst
			// of concurrent down votes can overshoot the threshold by a few points.)
			if (value === "down" && !(await hasVote(voterId, target, signed))) {
				await requirePrivilege(db, { id: voterId }, "downvote", thresholds);
			}
			await db
				.insert(votes)
				.values({ userId: voterId, ...target, value: signed })
				.onConflictDoUpdate({
					target: [votes.userId, votes.targetType, votes.targetId],
					set: { value: signed },
				});
			await settleVote(db, voterId, target, authorId, limits);
			const score = await recount(target);
			await settleAgent(target, authorId, score);
			return { score, vote: value };
		},

		async retract(voterId: string, target: VoteTarget) {
			const authorId = await guard(voterId, target);
			await db
				.delete(votes)
				.where(
					and(
						eq(votes.userId, voterId),
						eq(votes.targetType, target.targetType),
						eq(votes.targetId, target.targetId),
					),
				);
			await settleVote(db, voterId, target, authorId, limits);
			const score = await recount(target);
			await settleAgent(target, authorId, score);
			return { score, vote: null };
		},
	};
}
