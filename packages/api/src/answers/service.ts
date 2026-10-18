import type { CreateAnswerInput } from "@codesphere/contract/answers";
import type { Database } from "@codesphere/db";
import { answers, questions } from "@codesphere/db/schema/questions";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { sanitizeMarkdown } from "../markdown/sanitizer";
import { settleAcceptance } from "../reputation/service";

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

export function createAnswerService(db: Database) {
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

	const toDTO = (
		row: typeof answers.$inferSelect,
		acceptedAnswerId: string | null,
	) => ({
		id: row.id,
		questionId: row.questionId,
		authorId: row.authorId,
		body: row.body,
		bodyHtml: row.bodyHtml,
		score: row.score,
		accepted: acceptedAnswerId === row.id,
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
			const items = rows.map((row) => toDTO(row, q.acceptedAnswerId));
			// The Accepted answer comes first, whatever its Score (the sort is stable).
			items.sort((a, b) => Number(b.accepted) - Number(a.accepted));
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
				return toDTO(replay, q.acceptedAnswerId);
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
				return toDTO(row, q.acceptedAnswerId);
			} catch (err) {
				if (!isUniqueViolation(err)) {
					throw err;
				}
				// A racing replay of this key, or the Member's other Answer to this Question.
				const existing = await byAuthorAndKey(authorId, input.idempotencyKey);
				if (existing) {
					return toDTO(existing, q.acceptedAnswerId);
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
			return toDTO(updated, q.acceptedAnswerId);
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
				await settleAcceptance(db, q.id);
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
			await db
				.update(questions)
				.set({
					acceptedAnswerId: a.id,
					status: sql`CASE WHEN ${questions.status} = 'closed' THEN 'closed' ELSE 'answered' END`,
					version: q.version + 1,
				})
				.where(eq(questions.id, q.id));
			await settleAcceptance(db, q.id);
			return toDTO(a, a.id);
		},
	};
}

export type AnswerService = ReturnType<typeof createAnswerService>;
