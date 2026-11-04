import type { Database } from "@codesphere/db";
import { answers, questions } from "@codesphere/db/schema/questions";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

const LIMIT = 10;

/** The Member's latest Questions and Answers for the settings « Activité » tab (#293). */
export async function memberActivity(db: Database, userId: string) {
	const answerCount = sql<number>`(
		select count(*)::int from ${answers}
		where ${answers.questionId} = ${questions.id} and ${answers.deletedAt} is null
	)`;
	const ownQuestions = await db
		.select({
			id: questions.id,
			title: questions.title,
			status: questions.status,
			score: questions.score,
			answerCount,
			createdAt: questions.createdAt,
		})
		.from(questions)
		.where(and(eq(questions.authorId, userId), isNull(questions.deletedAt)))
		.orderBy(desc(questions.createdAt))
		.limit(LIMIT);

	const ownAnswers = await db
		.select({
			id: answers.id,
			questionId: answers.questionId,
			questionTitle: questions.title,
			score: answers.score,
			acceptedAnswerId: questions.acceptedAnswerId,
			createdAt: answers.createdAt,
		})
		.from(answers)
		.innerJoin(questions, eq(questions.id, answers.questionId))
		.where(
			and(
				eq(answers.authorId, userId),
				isNull(answers.deletedAt),
				isNull(questions.deletedAt),
			),
		)
		.orderBy(desc(answers.createdAt))
		.limit(LIMIT);

	return {
		questions: ownQuestions.map((q) => ({
			...q,
			createdAt: q.createdAt.toISOString(),
		})),
		answers: ownAnswers.map(({ acceptedAnswerId, ...a }) => ({
			...a,
			accepted: acceptedAnswerId === a.id,
			createdAt: a.createdAt.toISOString(),
		})),
	};
}
