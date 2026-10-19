import type { CreateAnswerInput } from "@codesphere/contract/answers";
import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import { answers, questions, votes } from "@codesphere/db/schema/questions";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { sanitizeMarkdown } from "../markdown/sanitizer";
import {
	FARMING_LIMITS,
	type FarmingLimits,
	settleAcceptance,
} from "../reputation/service";

/** A refused answer operation. `currentVersion` is set on a CONFLICT from a stale write only. */
export class AnswerError extends Error {
	constructor(
		readonly code: "NOT_FOUND" | "FORBIDDEN" | "CONFLICT",
		readonly currentVersion?: number,
	) {
		super(code);
	}
}

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown) {
	const code =
		(err as { code?: string }).code ??
		(err as { cause?: { code?: string } }).cause?.code;
	return code === UNIQUE_VIOLATION;
}

export function createAnswerService(
	db: Database,
	limits: FarmingLimits = FARMING_LIMITS,
) {
	async function findQuestion(id: string) {
		const [q] = await db
			.select()
			.from(questions)
			.where(and(eq(questions.id, id), isNull(questions.deletedAt)))
			.limit(1);
		if (!q) {
			throw new AnswerError("NOT_FOUND");
		}
		return q;
	}

	async function findAnswer(id: string) {
		const [a] = await db
			.select()
			.from(answers)
			.where(and(eq(answers.id, id), isNull(answers.deletedAt)))
			.limit(1);
		if (!a) {
			throw new AnswerError("NOT_FOUND");
		}
		return a;
	}

	type Row = typeof answers.$inferSelect;
	type QuestionRow = { acceptedAnswerId: string | null; authorId: string };

	/**
	 * The ids, among `rows`, of Agent Answers that no human has vouched for yet (#244): they are
	 * shown folded and ranked below the human Answers. One is unfolded by an up vote from a human
	 * Member other than the Agent's Owner (an Owner vouching for their own Agent proves nothing), or
	 * by its acceptance by a Question author other than that Owner. A down vote does not unfold.
	 */
	async function foldedAmong(rows: Row[], q: QuestionRow) {
		if (rows.length === 0) {
			return new Set<string>();
		}
		const authors = await db
			.select({ id: user.id, kind: user.kind, ownerId: user.ownerId })
			.from(user)
			.where(inArray(user.id, [...new Set(rows.map((row) => row.authorId))]));
		const byAuthor = new Map(authors.map((a) => [a.id, a]));
		const agentRows = rows.filter(
			(row) => byAuthor.get(row.authorId)?.kind === "agent",
		);
		if (agentRows.length === 0) {
			return new Set<string>();
		}
		const vouched = await db
			.selectDistinct({ id: votes.targetId })
			.from(votes)
			.innerJoin(answers, eq(answers.id, votes.targetId))
			.innerJoin(user, eq(user.id, answers.authorId))
			.where(
				and(
					eq(votes.targetType, "answer"),
					gt(votes.value, 0),
					inArray(
						votes.targetId,
						agentRows.map((row) => row.id),
					),
					// Not the Owner: a NULL owner (an Agent without one) vouches nobody out.
					sql`${votes.userId} IS DISTINCT FROM ${user.ownerId}`,
				),
			);
		const unfolded = new Set(vouched.map((v) => v.id));
		return new Set(
			agentRows
				.filter((row) => {
					const owner = byAuthor.get(row.authorId)?.ownerId;
					const acceptedByOther =
						q.acceptedAnswerId === row.id && q.authorId !== owner;
					return !unfolded.has(row.id) && !acceptedByOther;
				})
				.map((row) => row.id),
		);
	}

	const toDTO = (
		row: Row,
		acceptedAnswerId: string | null,
		collapsed: boolean,
	) => ({
		id: row.id,
		questionId: row.questionId,
		authorId: row.authorId,
		body: row.body,
		bodyHtml: row.bodyHtml,
		score: row.score,
		accepted: acceptedAnswerId === row.id,
		collapsed,
		version: row.version,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	});

	async function byAuthorAndKey(authorId: string, key: string) {
		const [row] = await db
			.select()
			.from(answers)
			.where(
				and(eq(answers.authorId, authorId), eq(answers.idempotencyKey, key)),
			)
			.limit(1);
		return row;
	}

	return {
		async list(questionId: string) {
			const q = await findQuestion(questionId);
			const rows = await db
				.select()
				.from(answers)
				.where(
					and(eq(answers.questionId, questionId), isNull(answers.deletedAt)),
				)
				.orderBy(desc(answers.score), answers.createdAt);
			const folded = await foldedAmong(rows, q);
			const items = rows.map((row) =>
				toDTO(row, q.acceptedAnswerId, folded.has(row.id)),
			);
			// The Accepted answer first, then the Answers a human stands behind, then the folded
			// Agent Answers (even one its Owner accepted); Score then age within each (the sort is stable).
			const rank = (a: (typeof items)[number]) =>
				a.collapsed ? 2 : a.accepted ? 0 : 1;
			items.sort((a, b) => rank(a) - rank(b));
			return { items };
		},

		/**
		 * One Answer per Member and Question, the author's own Question included. A replayed key
		 * returns the Answer it created; a second Answer under a new key is a CONFLICT, and so is
		 * answering a closed Question.
		 */
		async create(authorId: string, input: CreateAnswerInput) {
			const q = await findQuestion(input.questionId);
			const replay = await byAuthorAndKey(authorId, input.idempotencyKey);
			if (replay) {
				return toDTO(
					replay,
					q.acceptedAnswerId,
					(await foldedAmong([replay], q)).has(replay.id),
				);
			}
			if (q.status === "closed") {
				throw new AnswerError("CONFLICT");
			}
			try {
				const [row] = await db
					.insert(answers)
					.values({
						questionId: q.id,
						authorId,
						idempotencyKey: input.idempotencyKey,
						body: input.body,
						bodyHtml: sanitizeMarkdown(input.body).html,
					})
					.returning();
				if (!row) {
					throw new Error("INSERT returned no row");
				}
				return toDTO(
					row,
					q.acceptedAnswerId,
					(await foldedAmong([row], q)).has(row.id),
				);
			} catch (err) {
				if (!isUniqueViolation(err)) {
					throw err;
				}
				// A racing replay of this key, or the Member's other Answer to this Question.
				const existing = await byAuthorAndKey(authorId, input.idempotencyKey);
				if (existing) {
					return toDTO(
						existing,
						q.acceptedAnswerId,
						(await foldedAmong([existing], q)).has(existing.id),
					);
				}
				throw new AnswerError("CONFLICT");
			}
		},

		async update(
			actorId: string,
			input: { id: string; expectedVersion: number; body: string },
		) {
			const a = await findAnswer(input.id);
			if (a.authorId !== actorId) {
				throw new AnswerError("FORBIDDEN");
			}
			const [updated] = await db
				.update(answers)
				.set({
					body: input.body,
					bodyHtml: sanitizeMarkdown(input.body).html,
					version: input.expectedVersion + 1,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(answers.id, input.id),
						eq(answers.version, input.expectedVersion),
						isNull(answers.deletedAt),
					),
				)
				.returning();
			if (!updated) {
				const current = await findAnswer(input.id);
				throw new AnswerError("CONFLICT", current.version);
			}
			const q = await findQuestion(updated.questionId);
			return toDTO(
				updated,
				q.acceptedAnswerId,
				(await foldedAmong([updated], q)).has(updated.id),
			);
		},

		/** Soft delete. Deleting the Accepted answer clears it: the Question is open again. */
		async remove(
			actorId: string,
			input: { id: string; expectedVersion: number },
		) {
			const a = await findAnswer(input.id);
			if (a.authorId !== actorId) {
				throw new AnswerError("FORBIDDEN");
			}
			const rows = await db
				.update(answers)
				.set({
					deletedAt: new Date(),
					version: input.expectedVersion + 1,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(answers.id, input.id),
						eq(answers.version, input.expectedVersion),
						isNull(answers.deletedAt),
					),
				)
				.returning({ id: answers.id });
			if (rows.length === 0) {
				const current = await findAnswer(input.id);
				throw new AnswerError("CONFLICT", current.version);
			}
			const cleared = await db
				.update(questions)
				.set({
					acceptedAnswerId: null,
					status: sql`CASE WHEN ${questions.status} = 'answered' THEN 'open' ELSE ${questions.status} END`,
				})
				.where(eq(questions.acceptedAnswerId, input.id))
				.returning({ id: questions.id });
			for (const q of cleared) {
				await settleAcceptance(db, q.id, limits);
			}
			return { success: true };
		},

		/** Chosen, and changeable, by the Question's author alone. A closed Question stays closed. */
		async accept(actorId: string, answerId: string) {
			const a = await findAnswer(answerId);
			const q = await findQuestion(a.questionId);
			if (q.authorId !== actorId) {
				throw new AnswerError("FORBIDDEN");
			}
			// An Agent's Answer is accepted by a human only: an Agent cannot vouch for an Agent.
			const [actor] = await db
				.select({ kind: user.kind })
				.from(user)
				.where(eq(user.id, actorId))
				.limit(1);
			const [writer] = await db
				.select({ kind: user.kind })
				.from(user)
				.where(eq(user.id, a.authorId))
				.limit(1);
			if (writer?.kind === "agent" && actor?.kind !== "human") {
				throw new AnswerError("FORBIDDEN");
			}
			await db
				.update(questions)
				.set({
					acceptedAnswerId: a.id,
					status: sql`CASE WHEN ${questions.status} = 'closed' THEN 'closed' ELSE 'answered' END`,
					version: q.version + 1,
				})
				.where(eq(questions.id, q.id));
			await settleAcceptance(db, q.id, limits);
			return toDTO(
				a,
				a.id,
				(
					await foldedAmong([a], {
						acceptedAnswerId: a.id,
						authorId: q.authorId,
					})
				).has(a.id),
			);
		},
	};
}

export type AnswerService = ReturnType<typeof createAnswerService>;
