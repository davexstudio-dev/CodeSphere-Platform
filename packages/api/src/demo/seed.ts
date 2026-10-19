import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import { answers, questions, votes } from "@codesphere/db/schema/questions";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { createAgentService } from "../agents/service";
import { createAnswerService } from "../answers/service";
import { createQuestionService } from "../questions/service";
import { NO_FARMING_LIMITS, settleAcceptance } from "../reputation/service";
import { createVoteService } from "../votes/service";
import { demoMembers, demoQuestions } from "./content";

/** The demo Agent of docs/cadev/demo-script.md. */
export const DEMO_AGENT_NAME = "Assistant Mobile Money";

export class DemoSeedError extends Error {}

/**
 * Removes the demo content, so a changed version of it loads cleanly (`--reset`). The Votes are
 * retracted and the acceptances cleared through the same settlement as the API, so the Reputation
 * journal stays append-only and balanced; then the demo Members' Answers and Questions, and any
 * Answer on those Questions, are deleted. The Members themselves are kept: the seed updates them.
 */
export async function resetDemo(db: Database) {
	const memberIds = demoMembers.map((m) => m.id);
	const ownQuestions = await db
		.select({ id: questions.id })
		.from(questions)
		.where(inArray(questions.authorId, memberIds));
	const questionIds = ownQuestions.map((q) => q.id);
	const ownAnswers = await db
		.select({ id: answers.id })
		.from(answers)
		.where(
			or(
				inArray(answers.authorId, memberIds),
				questionIds.length > 0
					? inArray(answers.questionId, questionIds)
					: sql`false`,
			),
		);
	const answerIds = ownAnswers.map((a) => a.id);

	// Every Vote by a demo Member, and every Vote on demo content, whoever cast it.
	const touched = await db
		.select({
			userId: votes.userId,
			targetType: votes.targetType,
			targetId: votes.targetId,
		})
		.from(votes)
		.where(
			or(
				inArray(votes.userId, memberIds),
				questionIds.length > 0
					? and(
							eq(votes.targetType, "question"),
							inArray(votes.targetId, questionIds),
						)
					: sql`false`,
				answerIds.length > 0
					? and(
							eq(votes.targetType, "answer"),
							inArray(votes.targetId, answerIds),
						)
					: sql`false`,
			),
		);
	const votesService = createVoteService(db, undefined, NO_FARMING_LIMITS);
	for (const v of touched) {
		await votesService.retract(v.userId, {
			targetType: v.targetType,
			targetId: v.targetId,
		});
	}

	// Acceptances on demo Questions, or of a demo Answer on someone else's Question.
	const accepting = await db
		.update(questions)
		.set({
			acceptedAnswerId: null,
			status: sql`CASE WHEN ${questions.status} = 'answered' THEN 'open' ELSE ${questions.status} END`,
		})
		.where(
			or(
				questionIds.length > 0
					? inArray(questions.id, questionIds)
					: sql`false`,
				answerIds.length > 0
					? inArray(questions.acceptedAnswerId, answerIds)
					: sql`false`,
			),
		)
		.returning({ id: questions.id });
	for (const q of accepting) {
		await settleAcceptance(db, q.id, NO_FARMING_LIMITS);
	}

	if (answerIds.length > 0) {
		await db.delete(answers).where(inArray(answers.id, answerIds));
	}
	if (questionIds.length > 0) {
		await db.delete(questions).where(inArray(questions.id, questionIds));
	}
	return {
		questions: questionIds.length,
		answers: answerIds.length,
		votes: touched.length,
	};
}

/**
 * Loads the demo content through the same services as the API, so the Markdown is sanitized and
 * every Vote and acceptance writes its Reputation events. Replaying it changes nothing: the
 * Questions and Answers replay their idempotency keys, a Vote is an upsert, an acceptance is
 * settled to the same state. With `ownerEmail`, the demo Agent is created once for that Member
 * (who must have signed in already) and its key is returned that one time.
 */
export async function seedDemo(
	db: Database,
	options: { ownerEmail?: string } = {},
) {
	await db
		.insert(user)
		.values(
			demoMembers.map((m) => ({
				...m,
				emailVerified: true,
				kind: "human",
				// Their Tags are not asked for: the app would send them to the onboarding otherwise.
				tagsOnboardingSkippedAt: new Date(),
			})),
		)
		// A replay takes the current name and country: a database seeded earlier gets them too.
		.onConflictDoUpdate({
			target: user.id,
			set: { name: sql`excluded.name`, country: sql`excluded.country` },
		});

	const questionsService = createQuestionService(db);
	const answersService = createAnswerService(db, NO_FARMING_LIMITS);
	const votesService = createVoteService(db, undefined, NO_FARMING_LIMITS);
	let answers = 0;
	let votes = 0;
	let accepted = 0;

	for (const q of demoQuestions) {
		const question = await questionsService.createQuestion(q.authorId, {
			idempotencyKey: q.key,
			title: q.title,
			body: q.body,
			language: q.language,
			tags: q.tags,
		});
		for (const voterId of q.upvotes) {
			await votesService.cast(
				voterId,
				{ targetType: "question", targetId: question.id },
				"up",
			);
			votes++;
		}
		for (const a of q.answers) {
			const answer = await answersService.create(a.authorId, {
				idempotencyKey: a.key,
				questionId: question.id,
				body: a.body,
			});
			answers++;
			for (const voterId of a.upvotes) {
				await votesService.cast(
					voterId,
					{ targetType: "answer", targetId: answer.id },
					"up",
				);
				votes++;
			}
			if (a.accepted) {
				// Not again on a replay: accepting bumps the Question's version.
				if (!answer.accepted) {
					await answersService.accept(q.authorId, answer.id);
				}
				accepted++;
			}
		}
	}

	return {
		members: demoMembers.length,
		questions: demoQuestions.length,
		answers,
		votes,
		accepted,
		agent: options.ownerEmail
			? await seedDemoAgent(db, options.ownerEmail)
			: null,
	};
}

async function seedDemoAgent(db: Database, ownerEmail: string) {
	const [owner] = await db
		.select({ id: user.id, kind: user.kind })
		.from(user)
		.where(eq(user.email, ownerEmail))
		.limit(1);
	if (owner?.kind !== "human") {
		throw new DemoSeedError(
			`No human Member with the email ${ownerEmail}: sign in once with it first.`,
		);
	}
	const [existing] = await db
		.select({ id: user.id })
		.from(user)
		.where(
			and(
				eq(user.ownerId, owner.id),
				eq(user.kind, "agent"),
				eq(user.name, DEMO_AGENT_NAME),
				or(isNull(user.suspensionReason), ne(user.suspensionReason, "deleted")),
			),
		)
		.limit(1);
	if (existing) {
		// The key is never kept in clear: rotate it from Settings → Agents if it is lost.
		return { id: existing.id, created: false, key: null };
	}
	const { agent, key } = await createAgentService(db).create(owner.id, {
		name: DEMO_AGENT_NAME,
		preset: "contribute",
	});
	return { id: agent.id, created: true, key };
}
