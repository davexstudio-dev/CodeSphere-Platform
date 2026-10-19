/// <reference types="bun" />
// Agent Answers stay folded until a human other than the Owner votes them up (#244), on Postgres.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import { answers, questions, votes } from "@codesphere/db/schema/questions";
import { reputationEvents } from "@codesphere/db/schema/reputation";
import { inArray, or } from "drizzle-orm";

import { NO_FARMING_LIMITS } from "../reputation/farming";
import { createVoteService } from "../votes/service";
import { AnswerError, createAnswerService } from "./service";

const url = process.env.TEST_DATABASE_URL;
const NO_PRIVILEGES = {
	flag: 0,
	propose_tag_edit: 0,
	downvote: 0,
	close_vote: 0,
	edit_tags: 0,
};

describe.skipIf(!url)("Agent Answers on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID();
	const asker = `it-aa-asker-${run}`;
	const owner = `it-aa-owner-${run}`;
	const bot = `it-aa-bot-${run}`;
	const helper = `it-aa-helper-${run}`;
	const critic = `it-aa-critic-${run}`;
	const ids = [asker, owner, bot, helper, critic];
	const service = createAnswerService(db, NO_FARMING_LIMITS);
	const vote = createVoteService(db, NO_PRIVILEGES, NO_FARMING_LIMITS);
	let questionId = "";
	let humanAnswer = "";
	let agentAnswer = "";

	const listed = async () =>
		(await service.list(questionId)).items.map((a) => ({
			id: a.id,
			collapsed: a.collapsed,
			accepted: a.accepted,
		}));
	const agentView = async () =>
		(await listed()).find((a) => a.id === agentAnswer);
	const target = () => ({
		targetType: "answer" as const,
		targetId: agentAnswer,
	});

	beforeAll(async () => {
		await db.insert(user).values([
			...[asker, owner, helper, critic].map((id) => ({
				id,
				name: id,
				email: `${id}@example.com`,
			})),
			{
				id: bot,
				name: bot,
				email: `${bot}@agents.invalid`,
				kind: "agent" as const,
				ownerId: owner,
			},
		]);
		const [q] = await db
			.insert(questions)
			.values({
				authorId: asker,
				idempotencyKey: crypto.randomUUID(),
				title: "Question",
				body: "b",
				bodyHtml: "<p>b</p>",
				language: "en",
				tags: ["sql"],
			})
			.returning();
		questionId = q?.id ?? "";
		const [human] = await db
			.insert(answers)
			.values({
				questionId,
				authorId: helper,
				idempotencyKey: crypto.randomUUID(),
				body: "human",
				bodyHtml: "<p>human</p>",
				// Worse than the Agent's: a folded Agent Answer still ranks below it.
				score: -3,
			})
			.returning();
		const [agent] = await db
			.insert(answers)
			.values({
				questionId,
				authorId: bot,
				idempotencyKey: crypto.randomUUID(),
				body: "agent",
				bodyHtml: "<p>agent</p>",
			})
			.returning();
		humanAnswer = human?.id ?? "";
		agentAnswer = agent?.id ?? "";
	});

	afterAll(async () => {
		await db
			.delete(reputationEvents)
			.where(
				or(
					inArray(reputationEvents.userId, ids),
					inArray(reputationEvents.actorId, ids),
				),
			);
		await db.delete(votes).where(inArray(votes.userId, ids));
		await db.delete(answers).where(inArray(answers.authorId, ids));
		await db.delete(questions).where(inArray(questions.authorId, ids));
		await db.delete(user).where(inArray(user.id, ids));
	});

	test("a new Agent Answer is folded and ranked below a human Answer with a worse Score", async () => {
		const items = await listed();
		expect(items.map((a) => a.id)).toEqual([humanAnswer, agentAnswer]);
		expect(items.find((a) => a.id === humanAnswer)?.collapsed).toBe(false);
		expect(items.find((a) => a.id === agentAnswer)?.collapsed).toBe(true);
	});

	test("the Owner's up vote does not unfold it", async () => {
		await vote.cast(owner, target(), "up");
		expect((await agentView())?.collapsed).toBe(true);
	});

	test("a down vote from another human does not unfold it", async () => {
		await vote.cast(critic, target(), "down");
		expect((await agentView())?.collapsed).toBe(true);
	});

	test("an up vote from a human other than the Owner unfolds it, and it ranks by Score", async () => {
		await vote.cast(helper, target(), "up");
		expect((await agentView())?.collapsed).toBe(false);
		// Score 1 (owner +1, critic -1, helper +1) beats the human Answer's -3.
		expect((await listed()).map((a) => a.id)).toEqual([
			agentAnswer,
			humanAnswer,
		]);
	});

	test("it folds again if that vote is taken back", async () => {
		await vote.retract(helper, target());
		expect((await agentView())?.collapsed).toBe(true);
	});

	test("only a human can accept an Agent Answer, and the acceptance by someone else than the Owner unfolds it", async () => {
		// The Question's author here is the human asker.
		const accepted = await service.accept(asker, agentAnswer);
		expect(accepted).toMatchObject({ accepted: true, collapsed: false });
		expect((await listed())[0]).toMatchObject({
			id: agentAnswer,
			accepted: true,
			collapsed: false,
		});
	});

	test("an Agent cannot accept an Agent Answer on its own Question", async () => {
		const [own] = await db
			.insert(questions)
			.values({
				authorId: bot,
				idempotencyKey: crypto.randomUUID(),
				title: "Agent question",
				body: "b",
				bodyHtml: "<p>b</p>",
				language: "en",
				tags: ["sql"],
			})
			.returning();
		const [reply] = await db
			.insert(answers)
			.values({
				questionId: own?.id ?? "",
				authorId: helper,
				idempotencyKey: crypto.randomUUID(),
				body: "r",
				bodyHtml: "<p>r</p>",
			})
			.returning();
		// A human Answer is acceptable by the Agent that asked; the point is the next case.
		await expect(service.accept(bot, reply?.id ?? "")).resolves.toBeDefined();

		const [other] = await db
			.insert(answers)
			.values({
				questionId: own?.id ?? "",
				authorId: bot,
				idempotencyKey: crypto.randomUUID(),
				body: "self",
				bodyHtml: "<p>self</p>",
			})
			.returning();
		await expect(service.accept(bot, other?.id ?? "")).rejects.toBeInstanceOf(
			AnswerError,
		);
	});

	test("the Owner accepting their own Agent's Answer does not unfold it", async () => {
		const [mine] = await db
			.insert(questions)
			.values({
				authorId: owner,
				idempotencyKey: crypto.randomUUID(),
				title: "Owner question",
				body: "b",
				bodyHtml: "<p>b</p>",
				language: "en",
				tags: ["sql"],
			})
			.returning();
		const [reply] = await db
			.insert(answers)
			.values({
				questionId: mine?.id ?? "",
				authorId: bot,
				idempotencyKey: crypto.randomUUID(),
				body: "for my owner",
				bodyHtml: "<p>x</p>",
			})
			.returning();
		const accepted = await service.accept(owner, reply?.id ?? "");
		expect(accepted).toMatchObject({ accepted: true, collapsed: true });
	});
});
