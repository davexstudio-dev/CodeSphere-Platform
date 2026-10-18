import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import { answers, questions, votes } from "@codesphere/db/schema/questions";
import { reputationEvents } from "@codesphere/db/schema/reputation";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

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
type Grant = { userId: string; kind: Kind; points: number };

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
 */
async function settle(db: Database, source: Source, wanted: Grant[]) {
	const granted = await db
		.select({
			userId: reputationEvents.userId,
			kind: reputationEvents.kind,
			points: sql<number>`COALESCE(SUM(${reputationEvents.points}), 0)::int`,
		})
		.from(reputationEvents)
		.where(sourceIs(source))
		.groupBy(reputationEvents.userId, reputationEvents.kind);

	const key = (g: { userId: string; kind: Kind }) =>
		`${g.userId}\u0000${g.kind}`;
	const delta = new Map<string, Grant>();
	for (const g of wanted) {
		delta.set(key(g), { ...g });
	}
	for (const g of granted) {
		const entry = delta.get(key(g)) ?? { ...g, points: 0 };
		entry.points -= g.points;
		delta.set(key(g), entry);
	}
	const rows = [...delta.values()]
		.filter((g) => g.points !== 0)
		.map((g) => ({ ...g, ...source }));
	if (rows.length > 0) {
		await db.insert(reputationEvents).values(rows);
	}
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
) {
	const [vote] = await db
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
	await settle(db, { cause: "vote", actorId: voterId, ...target }, wanted);
}

/**
 * Settles the acceptance on a Question, as it stands now: accepted, changed to another Answer, or
 * cleared. Accepting one's own Answer earns nothing.
 */
export async function settleAcceptance(db: Database, questionId: string) {
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
	);
}

/** A Member's Reputation: the sum of their journal. An Agent has none (null). */
export async function reputationOf(
	db: Database,
	member: { id: string; kind: string },
) {
	if (member.kind !== "human") {
		return null;
	}
	const [row] = await db
		.select({
			total: sql<number>`COALESCE(SUM(${reputationEvents.points}), 0)::int`,
		})
		.from(reputationEvents)
		.where(eq(reputationEvents.userId, member.id));
	return row?.total ?? 0;
}
