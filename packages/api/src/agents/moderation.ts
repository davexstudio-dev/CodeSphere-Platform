import type { Database } from "@codesphere/db";
import { agentPauses, agentRejections } from "@codesphere/db/schema/agents";
import { auditLog } from "@codesphere/db/schema/audit";
import { apikey, user } from "@codesphere/db/schema/auth";
import { and, count, desc, eq, gt, gte, isNull, sql } from "drizzle-orm";
import * as z from "zod";

// Moderation of Agent Answers (#245, decision #220). The thresholds are configuration.
export type AgentRules = {
	/** An Agent's Answer at or under this Score is rejected. */
	rejectScore: number;
	/** Rejections within the window that pause the Agent's key. */
	pauseAfter: number;
	windowDays: number;
	/** Agents of one Owner paused within the block window that stop the Owner creating Agents. */
	creationBlockAfter: number;
	creationBlockDays: number;
};

export const DEFAULT_AGENT_RULES: AgentRules = {
	rejectScore: -3,
	pauseAfter: 5,
	windowDays: 30,
	creationBlockAfter: 2,
	creationBlockDays: 30,
};

const Overrides = z
	.object({
		rejectScore: z.number().int().min(-1000).max(0),
		pauseAfter: z.number().int().min(1).max(1000),
		windowDays: z.number().int().min(1).max(365),
		creationBlockAfter: z.number().int().min(1).max(100),
		creationBlockDays: z.number().int().min(1).max(365),
	})
	.partial()
	.strict();

/**
 * The rules in force: the defaults overridden by `AGENT_RULES`, a JSON object such as
 * `{"pauseAfter": 3}`. A malformed value throws, so a typo stops the deployment.
 */
export function parseAgentRules(raw: string | undefined): AgentRules {
	if (!raw?.trim()) {
		return DEFAULT_AGENT_RULES;
	}
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		throw new Error("AGENT_RULES is not valid JSON");
	}
	const parsed = Overrides.safeParse(json);
	if (!parsed.success) {
		throw new Error(
			`AGENT_RULES is invalid: ${parsed.error.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; ")}`,
		);
	}
	return { ...DEFAULT_AGENT_RULES, ...parsed.data };
}

const DAY = 86_400_000;

export type PausedAgent = {
	agentId: string;
	agentName: string;
	ownerId: string;
};

/**
 * Settles one Agent Answer after its Score changed: records or clears its rejection, and pauses the
 * Agent's key when enough rejections stand. Returns the Agent when this call paused it, so the
 * caller can tell the Owner. A no-op for a human author. A rejection stands even if the Answer is
 * deleted afterwards: otherwise an Agent could delete its rejected Answers to stay under the limit.
 */
export async function settleAgentAnswer(
	db: Database,
	authorId: string,
	answerId: string,
	score: number,
	rules: AgentRules = DEFAULT_AGENT_RULES,
	now: () => number = Date.now,
): Promise<PausedAgent | null> {
	const [agent] = await db
		.select({ kind: user.kind, name: user.name, ownerId: user.ownerId })
		.from(user)
		.where(eq(user.id, authorId))
		.limit(1);
	if (agent?.kind !== "agent") {
		return null;
	}
	if (score > rules.rejectScore) {
		await db
			.delete(agentRejections)
			.where(eq(agentRejections.answerId, answerId));
		return null;
	}
	await db
		.insert(agentRejections)
		.values({ answerId, agentId: authorId, rejectedAt: new Date(now()) })
		.onConflictDoNothing();

	// Only rejections after the last pause count: an Agent brought back starts clean.
	const [last] = await db
		.select({ pausedAt: agentPauses.pausedAt })
		.from(agentPauses)
		.where(eq(agentPauses.agentId, authorId))
		.orderBy(desc(agentPauses.pausedAt))
		.limit(1);
	const windowStart = new Date(now() - rules.windowDays * DAY);
	const since =
		last && last.pausedAt > windowStart ? last.pausedAt : windowStart;
	const [standing] = await db
		.select({ n: count() })
		.from(agentRejections)
		.where(
			and(
				eq(agentRejections.agentId, authorId),
				gt(agentRejections.rejectedAt, since),
			),
		);
	if ((standing?.n ?? 0) < rules.pauseAfter) {
		return null;
	}
	// The partial unique index lets one concurrent trigger win.
	const paused = await db
		.insert(agentPauses)
		.values({ agentId: authorId, pausedAt: new Date(now()) })
		.onConflictDoNothing()
		.returning({ id: agentPauses.id });
	if (paused.length === 0) {
		return null;
	}
	await db
		.update(apikey)
		.set({ enabled: false, updatedAt: new Date() })
		.where(eq(apikey.referenceId, authorId));
	await db.insert(auditLog).values({
		actorId: null,
		action: "agent.pause",
		targetType: "agent",
		targetId: authorId,
		details: { reason: "rejections" },
	});
	return agent.ownerId
		? { agentId: authorId, agentName: agent.name, ownerId: agent.ownerId }
		: null;
}

/** Whether the Agent is paused now, and how many times it has been paused in all. */
export async function pauseState(db: Database, agentId: string) {
	const rows = await db
		.select({ endedAt: agentPauses.endedAt })
		.from(agentPauses)
		.where(eq(agentPauses.agentId, agentId));
	return {
		open: rows.some((row) => row.endedAt === null),
		count: rows.length,
	};
}

/** Ends the standing pause of an Agent, if any. Returns whether one was ended. */
export async function endPause(db: Database, agentId: string, by: string) {
	const ended = await db
		.update(agentPauses)
		.set({ endedAt: new Date(), endedBy: by })
		.where(and(eq(agentPauses.agentId, agentId), isNull(agentPauses.endedAt)))
		.returning({ id: agentPauses.id });
	return ended.length > 0;
}

/**
 * When the Owner may create Agents again, or null if they may now: two of their Agents paused
 * within the window block creation until the older of the two leaves it.
 */
export async function creationBlockedUntil(
	db: Database,
	ownerId: string,
	rules: AgentRules = DEFAULT_AGENT_RULES,
	now: () => number = Date.now,
): Promise<Date | null> {
	const rows = await db
		.select({
			agentId: agentPauses.agentId,
			pausedAt: sql`MAX(${agentPauses.pausedAt})`.mapWith(agentPauses.pausedAt),
		})
		.from(agentPauses)
		.innerJoin(user, eq(user.id, agentPauses.agentId))
		.where(
			and(
				eq(user.ownerId, ownerId),
				gte(
					agentPauses.pausedAt,
					new Date(now() - rules.creationBlockDays * DAY),
				),
			),
		)
		.groupBy(agentPauses.agentId)
		.orderBy(desc(sql`MAX(${agentPauses.pausedAt})`));
	if (rows.length < rules.creationBlockAfter) {
		return null;
	}
	// The block lifts when the Nth most recent paused Agent leaves the window.
	const decisive = rows[rules.creationBlockAfter - 1];
	return new Date(
		(decisive?.pausedAt ?? new Date(now())).getTime() +
			rules.creationBlockDays * DAY,
	);
}
