import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
// biome-ignore lint/style/noRestrictedImports: tolerated, the ledger derives events from votes and authorship; move behind a Q&A contract (#254)
import { answers, questions, votes } from "@codesphere/db/schema/questions";
import { reputationEvents } from "@codesphere/db/schema/reputation";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import {
	FARMING_LIMITS,
	type FarmingLimits,
	type VoidedReason,
} from "./farming";

export * from "./farming";
export * from "./privileges";
export { reputationOf, reputationsOf } from "./read";

// What each action is worth (decision #219, phase 1: only Votes and acceptances count). Changing a
// value applies to new events; a retraction gives back exactly what its source had granted.
export const REPUTATION_POINTS = {
	upvoteOnAnswer: 10,
	upvoteOnQuestion: 5,
	answerAccepted: 15,
	acceptGiven: 2,
	downvoteReceived: -2,
	downvoteCast: -1,
} as const;

type Kind = (typeof reputationEvents.$inferInsert)["kind"];
type Source = Pick<
	typeof reputationEvents.$inferInsert,
	"cause" | "actorId" | "targetType" | "targetId"
>;
/** `blocked`: a rule cancels the whole grant (it is journalled voided instead of counted). */
type Grant = {
	userId: string;
	kind: Kind;
	points: number;
	blocked?: VoidedReason;
};

const sourceIs = (s: Source) =>
	and(
		eq(reputationEvents.cause, s.cause),
		eq(reputationEvents.actorId, s.actorId),
		eq(reputationEvents.targetType, s.targetType),
		eq(reputationEvents.targetId, s.targetId),
	);

/**
 * Brings what a source has granted in line with what it should grant now, by appending the
 * difference: the journal is never rewritten. Like the Score's recount, it reads the current state
 * rather than trusting the caller, and there is no transaction on the edge database, so a racing
 * write is corrected by the next settlement of the same source.
 *
 * Anti-farming (#241): a `blocked` grant, and the part of a gain above the daily cap, are appended
 * voided with their reason instead of counted. Only counted rows are compared with what is wanted.
 */
async function settle(
	db: Database,
	source: Source,
	wanted: Grant[],
	limits: FarmingLimits,
) {
	const rows = await db
		.select({
			userId: reputationEvents.userId,
			kind: reputationEvents.kind,
			voidedReason: reputationEvents.voidedReason,
			points: sql<number>`COALESCE(SUM(${reputationEvents.points}), 0)::int`,
		})
		.from(reputationEvents)
		.where(sourceIs(source))
		.groupBy(
			reputationEvents.userId,
			reputationEvents.kind,
			reputationEvents.voidedReason,
		);
	const granted = rows.filter((r) => r.voidedReason === null);

	const key = (g: { userId: string; kind: Kind }) =>
		`${g.userId}\u0000${g.kind}`;
	const voidedBefore = (g: { userId: string; kind: Kind }, why: VoidedReason) =>
		rows
			.filter((r) => key(r) === key(g) && r.voidedReason === why)
			.reduce((sum, r) => sum + r.points, 0);

	const counted = new Map<string, Grant>();
	const toVoid: {
		userId: string;
		kind: Kind;
		points: number;
		why: VoidedReason;
	}[] = [];
	for (const g of wanted) {
		if (g.blocked) {
			// Journalled once per reason: a repeated settlement must not stack voided rows.
			if (voidedBefore(g, g.blocked) === 0) {
				toVoid.push({ ...g, why: g.blocked });
			}
			continue;
		}
		counted.set(key(g), { ...g });
	}
	for (const g of granted) {
		const entry = counted.get(key(g)) ?? { ...g, points: 0 };
		entry.points -= g.points;
		counted.set(key(g), entry);
	}

	const inserts: (typeof reputationEvents.$inferInsert)[] = [];
	const gains = new Map<string, number>();
	for (const g of counted.values()) {
		if (g.points === 0) {
			continue;
		}
		const isGain = wanted.some(
			(w) => !w.blocked && key(w) === key(g) && w.points > 0,
		);
		if (g.points > 0 && isGain) {
			// Only a gain counts against the cap, never the refund of a cost.
			const gainedToday =
				gains.get(g.userId) ?? (await gainedSinceMidnight(db, g.userId));
			const room = Math.max(0, limits.dailyGainCap - gainedToday);
			const allowed = Math.min(g.points, room);
			const over = Math.max(
				0,
				g.points - allowed - voidedBefore(g, "daily_cap"),
			);
			gains.set(g.userId, gainedToday + allowed);
			if (allowed > 0) {
				inserts.push({ ...g, points: allowed, ...source });
			}
			if (over > 0) {
				toVoid.push({ ...g, points: over, why: "daily_cap" });
			}
		} else {
			inserts.push({ ...g, ...source });
		}
	}
	for (const { why, ...v } of toVoid) {
		inserts.push({ ...v, ...source, voidedReason: why });
	}
	if (inserts.length > 0) {
		await db.insert(reputationEvents).values(inserts);
	}
}

/** What a Member has gained today and the journal counts: the base of the daily cap. */
async function gainedSinceMidnight(db: Database, userId: string) {
	const [row] = await db
		.select({
			total: sql<number>`COALESCE(SUM(${reputationEvents.points}), 0)::int`,
		})
		.from(reputationEvents)
		.where(
			and(
				eq(reputationEvents.userId, userId),
				isNull(reputationEvents.voidedReason),
				sql`${reputationEvents.points} > 0`,
				gte(reputationEvents.createdAt, sql`date_trunc('day', now())`),
			),
		);
	return row?.total ?? 0;
}

// Agents earn nothing (spec §2), and neither does their Owner for what they post: the author of an
// Agent's content is the Agent, so leaving the Agent out is enough.
async function humans(db: Database, ids: string[]) {
	if (ids.length === 0) {
		return new Set<string>();
	}
	const rows = await db
		.select({ id: user.id })
		.from(user)
		.where(and(inArray(user.id, ids), eq(user.kind, "human")));
	return new Set(rows.map((r) => r.id));
}

/** Settles the Vote of `voterId` on a target, as it stands now (cast, changed or retracted). */
export async function settleVote(
	db: Database,
	voterId: string,
	target: { targetType: "question" | "answer"; targetId: string },
	authorId: string,
	limits: FarmingLimits = FARMING_LIMITS,
) {
	const [vote] = await db
		.select({ value: votes.value, castAt: votes.createdAt })
		.from(votes)
		.where(
			and(
				eq(votes.userId, voterId),
				eq(votes.targetType, target.targetType),
				eq(votes.targetId, target.targetId),
			),
		)
		.limit(1);
	const human = await humans(db, [voterId, authorId]);
	const wanted: Grant[] = [];
	if (vote && human.has(voterId) && authorId !== voterId) {
		if (vote.value > 0 && human.has(authorId)) {
			wanted.push({
				userId: authorId,
				kind: "upvote_received",
				points:
					target.targetType === "answer"
						? REPUTATION_POINTS.upvoteOnAnswer
						: REPUTATION_POINTS.upvoteOnQuestion,
			});
		}
		if (vote.value < 0) {
			if (human.has(authorId)) {
				wanted.push({
					userId: authorId,
					kind: "downvote_received",
					points: REPUTATION_POINTS.downvoteReceived,
				});
			}
			wanted.push({
				userId: voterId,
				kind: "downvote_cast",
				points: REPUTATION_POINTS.downvoteCast,
			});
		}
	}
	const received = wanted.filter((g) => g.userId === authorId);
	if (vote && received.length > 0) {
		const blocked = await blockedReason(
			db,
			{ voterId, authorId, target, castAt: vote.castAt },
			limits,
		);
		for (const g of received) {
			g.blocked = blocked;
		}
	}
	await settle(
		db,
		{ cause: "vote", actorId: voterId, ...target },
		wanted,
		limits,
	);
}

/**
 * Why the points a vote grants its author must not count, if a rule says so: a voter whose account
 * was under `minAccountAgeDays` old when voting, or one who already gave this author more than
 * `repeatVoterMax` votes (other targets, counted ones) within the window. Closed circles are caught
 * the same way, voter by voter; graph detection is out of scope.
 */
async function blockedReason(
	db: Database,
	v: {
		voterId: string;
		authorId: string;
		target: { targetType: "question" | "answer"; targetId: string };
		castAt: Date;
	},
	limits: FarmingLimits,
): Promise<VoidedReason | undefined> {
	const [voter] = await db
		.select({ createdAt: user.createdAt })
		.from(user)
		.where(eq(user.id, v.voterId))
		.limit(1);
	const ageMs = voter ? v.castAt.getTime() - voter.createdAt.getTime() : 0;
	if (ageMs < limits.minAccountAgeDays * 86_400_000) {
		return "new_account";
	}
	if (Number.isFinite(limits.repeatVoterMax)) {
		const [row] = await db
			.select({
				count: sql<number>`COUNT(DISTINCT ${reputationEvents.targetId})::int`,
			})
			.from(reputationEvents)
			.where(
				and(
					eq(reputationEvents.cause, "vote"),
					eq(reputationEvents.actorId, v.voterId),
					eq(reputationEvents.userId, v.authorId),
					inArray(reputationEvents.kind, [
						"upvote_received",
						"downvote_received",
					]),
					isNull(reputationEvents.voidedReason),
					gte(
						reputationEvents.createdAt,
						sql`now() - make_interval(days => ${limits.repeatWindowDays})`,
					),
					sql`NOT (${reputationEvents.targetType} = ${v.target.targetType} AND ${reputationEvents.targetId} = ${v.target.targetId})`,
				),
			);
		if ((row?.count ?? 0) >= limits.repeatVoterMax) {
			return "repeat_voter";
		}
	}
	return undefined;
}

/**
 * Settles the acceptance on a Question, as it stands now: accepted, changed to another Answer, or
 * cleared. Accepting one's own Answer earns nothing.
 */
export async function settleAcceptance(
	db: Database,
	questionId: string,
	limits: FarmingLimits = FARMING_LIMITS,
) {
	const [q] = await db
		.select({
			authorId: questions.authorId,
			answerAuthorId: answers.authorId,
		})
		.from(questions)
		.leftJoin(
			answers,
			and(
				eq(answers.id, questions.acceptedAnswerId),
				isNull(answers.deletedAt),
			),
		)
		.where(and(eq(questions.id, questionId), isNull(questions.deletedAt)))
		.limit(1);
	if (!q) {
		return;
	}
	const wanted: Grant[] = [];
	const answerer = q.answerAuthorId;
	if (answerer && answerer !== q.authorId) {
		const human = await humans(db, [q.authorId, answerer]);
		if (human.has(answerer)) {
			wanted.push({
				userId: answerer,
				kind: "answer_accepted",
				points: REPUTATION_POINTS.answerAccepted,
			});
		}
		if (human.has(q.authorId)) {
			wanted.push({
				userId: q.authorId,
				kind: "accept_given",
				points: REPUTATION_POINTS.acceptGiven,
			});
		}
	}
	await settle(
		db,
		{
			cause: "accept",
			actorId: q.authorId,
			targetType: "question",
			targetId: questionId,
		},
		wanted,
		limits,
	);
}
