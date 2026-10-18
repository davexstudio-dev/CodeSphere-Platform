/// <reference types="bun" />
// The Question page reads (#69): questions.get and answers.list carry the author, the Owner of an
// Agent author and the caller's own vote, against a real Postgres.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { apikey, user } from "@codesphere/db/schema/auth";
import { answers, questions, votes } from "@codesphere/db/schema/questions";
import { reputationEvents } from "@codesphere/db/schema/reputation";
import { createRouterClient } from "@orpc/server";
import { inArray, or } from "drizzle-orm";

import { appRouter } from "../routers";
import { testContext } from "../test-context";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Question page reads on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID();
	const asker = `it-qv-asker-${run}`;
	const voter = `it-qv-voter-${run}`;
	const owner = `it-qv-owner-${run}`;
	const ids = [asker, voter, owner];
	let bot = "";

	const clientAs = (id: string | null, kind = "human") =>
		createRouterClient(appRouter, {
			context: testContext({
				db,
				session: id
					? ({
							user: { id, role: "member", kind },
							session: { id: `s-${id}` },
						} as unknown as Session)
					: null,
			}),
		});

	let questionId = "";
	let answerId = "";

	beforeAll(async () => {
		await db.insert(user).values([
			{ id: asker, name: "Awa", email: `${asker}@example.com`, country: "SN" },
			{ id: voter, name: "Kofi", email: `${voter}@example.com` },
			{ id: owner, name: "Ama", email: `${owner}@example.com` },
		]);
		// A contribute key: the Agent may answer.
		bot = (
			await clientAs(owner).agents.create({
				name: "Helper",
				preset: "contribute",
			})
		).agent.id;
		const q = await clientAs(asker).questions.create({
			idempotencyKey: crypto.randomUUID(),
			title: "Which index?",
			body: "Body",
			language: "en",
			tags: ["sql"],
		});
		questionId = q.id;
		const a = await clientAs(bot, "agent").answers.create({
			idempotencyKey: crypto.randomUUID(),
			questionId,
			body: "Use a btree.",
		});
		answerId = a.id;
		await clientAs(voter).votes.cast({
			targetType: "question",
			targetId: questionId,
			value: "up",
		});
		await clientAs(voter).votes.cast({
			targetType: "answer",
			targetId: answerId,
			value: "down",
		});
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
		await db.delete(answers).where(inArray(answers.authorId, [...ids, bot]));
		await db.delete(questions).where(inArray(questions.authorId, ids));
		await db.delete(auditLog).where(inArray(auditLog.actorId, ids));
		await db.delete(apikey).where(inArray(apikey.referenceId, [bot]));
		await db.delete(user).where(inArray(user.id, [bot]));
		await db.delete(user).where(inArray(user.id, ids));
	});

	test("questions.get carries the author, Score, Answer count and the caller's vote", async () => {
		const seen = await clientAs(voter).questions.get({ id: questionId });
		expect(seen).toMatchObject({
			authorName: "Awa",
			authorKind: "human",
			ownerName: null,
			authorCountry: "SN",
			score: 1,
			answerCount: 1,
			myVote: "up",
		});
		const visitor = await clientAs(null).questions.get({ id: questionId });
		expect(visitor.myVote).toBeNull();
	});

	test("answers.list names an Agent author's Owner and the caller's vote", async () => {
		const { items } = await clientAs(voter).answers.list({ questionId });
		expect(items).toMatchObject([
			{
				id: answerId,
				authorName: "Helper",
				authorKind: "agent",
				ownerName: "Ama",
				score: -1,
				myVote: "down",
			},
		]);
		const visitor = await clientAs(null).answers.list({ questionId });
		expect(visitor.items[0]?.myVote).toBeNull();
	});

	test("an unknown Question is NOT_FOUND on both reads", async () => {
		const missing = "00000000-0000-7000-8000-000000000000";
		await expect(
			clientAs(null).questions.get({ id: missing }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			clientAs(null).answers.list({ questionId: missing }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("questions.list q finds Questions by a word of their title", async () => {
		const found = await clientAs(null).questions.list({
			q: "which btree INDEX",
			limit: 50,
		});
		expect(found.items.map((q) => q.id)).toContain(questionId);
		const none = await clientAs(null).questions.list({
			q: "zzqqxx-nothing",
			limit: 50,
		});
		expect(none.items.map((q) => q.id)).not.toContain(questionId);
	});

	test("markdown.preview renders like a save; a visitor is UNAUTHORIZED", async () => {
		const { html } = await clientAs(voter).markdown.preview({
			body: "**bold** <script>alert(1)</script> [x](https://example.com)",
		});
		expect(html).toContain("<strong>bold</strong>");
		expect(html).not.toContain("<script");
		expect(html).toContain('rel="nofollow noopener"');
		await expect(
			clientAs(null).markdown.preview({ body: "hi" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});
