/// <reference types="bun" />
// Account deletion keeps the votes and the Reputation journal, anonymised (#243), against Postgres.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { user } from "@codesphere/db/schema/auth";
import { questions, votes } from "@codesphere/db/schema/questions";
import { reputationEvents } from "@codesphere/db/schema/reputation";
import { createRouterClient } from "@orpc/server";
import { eq, inArray, or, sql } from "drizzle-orm";

import { appRouter } from "./routers";
import { testContext } from "./test-context";
import { createVoteService } from "./votes/service";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("members.delete on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID();
	const author = `it-del-author-${run}`;
	const leaver = `it-del-leaver-${run}`;
	const staying = `it-del-staying-${run}`;
	const late = `it-del-late-${run}`;
	const famous = `it-del-famous-${run}`;
	const ids = [author, leaver, staying, late, famous];
	const service = createVoteService(db);
	let questionId = "";

	const clientAs = (id: string) =>
		createRouterClient(appRouter, {
			context: testContext({
				db,
				session: {
					user: { id, role: "member", kind: "human" },
					session: { id: `s-${id}` },
				} as unknown as Session,
			}),
		});

	const scoreOf = async () =>
		(await db.select().from(questions).where(eq(questions.id, questionId)))[0]
			?.score;
	const reputationOfAuthor = async () =>
		(
			await db
				.select({
					total: sql<number>`COALESCE(SUM(${reputationEvents.points}), 0)::int`,
				})
				.from(reputationEvents)
				.where(eq(reputationEvents.userId, author))
		)[0]?.total;

	beforeAll(async () => {
		await db
			.insert(user)
			.values(ids.map((id) => ({ id, name: id, email: `${id}@example.com` })));
		const [q] = await db
			.insert(questions)
			.values({
				authorId: author,
				idempotencyKey: crypto.randomUUID(),
				title: "Question",
				body: "b",
				bodyHtml: "<p>b</p>",
				language: "en",
				tags: ["sql"],
			})
			.returning();
		questionId = q?.id ?? "";
		const target = { targetType: "question" as const, targetId: questionId };
		await service.cast(leaver, target, "up");
		await service.cast(staying, target, "up");
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
		await db.delete(questions).where(inArray(questions.authorId, ids));
		await db.delete(auditLog).where(inArray(auditLog.actorId, ids));
		await db.delete(user).where(inArray(user.id, ids));
	});

	test("deleting an account keeps its votes, so Scores and Reputation stay right", async () => {
		expect(await scoreOf()).toBe(2);
		const before = await reputationOfAuthor();
		expect(before).toBeGreaterThan(0);

		await clientAs(leaver).members.delete({ deleteContent: false });

		// The vote row stays, attributed to the anonymised member.
		const kept = await db.select().from(votes).where(eq(votes.userId, leaver));
		expect(kept).toHaveLength(1);
		const [row] = await db.select().from(user).where(eq(user.id, leaver));
		expect(row).toMatchObject({
			name: "Deleted member",
			email: `deleted-${leaver}@deleted.invalid`,
		});

		// A later vote recounts from the votes: the leaver's one must still be counted.
		await service.cast(
			late,
			{ targetType: "question", targetId: questionId },
			"up",
		);
		expect(await scoreOf()).toBe(3);
		// The author keeps every point the leaver's vote granted, plus the late vote's.
		expect(await reputationOfAuthor()).toBeGreaterThan(before ?? 0);
	});

	test("the journal survives deletion without exposing the member's identity", async () => {
		const events = await db
			.select()
			.from(reputationEvents)
			.where(eq(reputationEvents.actorId, leaver));
		expect(events.length).toBeGreaterThan(0);
		const [row] = await db.select().from(user).where(eq(user.id, leaver));
		expect(JSON.stringify(row)).not.toContain("example.com");
	});

	test("a deleted Member keeps their journal but shows no Reputation, on their profile or content", async () => {
		const [q] = await db
			.insert(questions)
			.values({
				authorId: famous,
				idempotencyKey: crypto.randomUUID(),
				title: "Famous question",
				body: "b",
				bodyHtml: "<p>b</p>",
				language: "en",
				tags: ["sql"],
			})
			.returning();
		await service.cast(
			staying,
			{ targetType: "question", targetId: q?.id ?? "" },
			"up",
		);
		const earned = await db
			.select()
			.from(reputationEvents)
			.where(eq(reputationEvents.userId, famous));
		expect(earned.length).toBeGreaterThan(0);
		expect(
			(await clientAs(staying).members.get({ id: famous })).reputation,
		).toBeGreaterThan(0);

		await clientAs(famous).members.delete({ deleteContent: false });

		const journal = await db
			.select()
			.from(reputationEvents)
			.where(eq(reputationEvents.userId, famous));
		expect(journal).toHaveLength(earned.length);
		expect(
			(await clientAs(staying).members.get({ id: famous })).reputation,
		).toBe(0);
		const listed = await clientAs(staying).questions.list({ limit: 50 });
		const shown = listed.items.find((item) => item.id === q?.id);
		expect(shown).toMatchObject({
			authorName: "Deleted member",
			authorReputation: 0,
		});
	});

	test("the export includes the member's reputation journal", async () => {
		const data = await clientAs(author).members.export();
		expect(data.reputationJournal.length).toBeGreaterThan(0);
		expect(data.reputationJournal[0]).toMatchObject({
			kind: "upvote_received",
			cause: "vote",
			targetType: "question",
			targetId: questionId,
		});
		// Only the author's own points, never another member's identity.
		expect(JSON.stringify(data.reputationJournal)).not.toContain(leaver);
	});
});
