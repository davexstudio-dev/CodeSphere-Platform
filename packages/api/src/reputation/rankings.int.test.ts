/// <reference types="bun" />
// Public Reputation rankings by country and by Tag, against Postgres (#242).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import { answers, questions } from "@codesphere/db/schema/questions";
import { reputationEvents } from "@codesphere/db/schema/reputation";
import { createRouterClient } from "@orpc/server";
import { inArray, or } from "drizzle-orm";

import { appRouter } from "../routers";
import { testContext } from "../test-context";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Reputation rankings on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID();
	// A country code no other suite uses.
	const big = `B${run.slice(0, 3)}`.toUpperCase();
	const small = `S${run.slice(0, 3)}`.toUpperCase();
	const tag = `rk-${run.slice(0, 8)}`;
	const members = [0, 1, 2, 3, 4, 5].map((n) => `it-rk-m${n}-${run}`);
	const tiny = [0, 1, 2, 3].map((n) => `it-rk-t${n}-${run}`);
	const suspended = `it-rk-susp-${run}`;
	const bot = `it-rk-bot-${run}`;
	const ids = [...members, ...tiny, suspended, bot];
	const api = createRouterClient(appRouter, {
		context: testContext({ db, session: null }),
	});
	const questionIds: string[] = [];

	const grant = (
		userId: string,
		points: number,
		target: { type: "question" | "answer"; id: string },
		voidedReason: "daily_cap" | null = null,
	) =>
		db.insert(reputationEvents).values({
			userId,
			kind: "upvote_received",
			points,
			cause: "vote",
			actorId: members[0] ?? "",
			targetType: target.type,
			targetId: target.id,
			voidedReason,
		});

	beforeAll(async () => {
		await db.insert(user).values([
			...members.map((id) => ({
				id,
				name: id,
				email: `${id}@example.com`,
				country: big,
			})),
			...tiny.map((id) => ({
				id,
				name: id,
				email: `${id}@example.com`,
				country: small,
			})),
			{
				id: suspended,
				name: suspended,
				email: `${suspended}@example.com`,
				country: big,
				suspendedAt: new Date(),
			},
			{
				id: bot,
				name: bot,
				email: `${bot}@agents.invalid`,
				country: big,
				kind: "agent" as const,
				ownerId: members[0],
			},
		]);
		// One Question carrying the Tag and one without, by member 0.
		const [tagged, other] = await db
			.insert(questions)
			.values(
				[[tag, "sql"], ["sql"]].map((tags) => ({
					authorId: members[0] ?? "",
					idempotencyKey: crypto.randomUUID(),
					title: "Question",
					body: "b",
					bodyHtml: "<p>b</p>",
					language: "en" as const,
					tags,
				})),
			)
			.returning();
		const [answer] = await db
			.insert(answers)
			.values({
				questionId: tagged?.id ?? "",
				authorId: members[1] ?? "",
				idempotencyKey: crypto.randomUUID(),
				body: "a",
				bodyHtml: "<p>a</p>",
			})
			.returning();
		questionIds.push(tagged?.id ?? "", other?.id ?? "");
		const q = (id?: string) => ({ type: "question" as const, id: id ?? "" });
		// Reputation: m0 +30 (all on the Tagged Question), m1 +20 (an Answer to the Tagged
		// Question), m2 +10 (on the untagged one), m3 +5. Cancelled and suspended do not count.
		await grant(members[0] ?? "", 30, q(tagged?.id));
		await grant(members[1] ?? "", 20, { type: "answer", id: answer?.id ?? "" });
		await grant(members[2] ?? "", 10, q(other?.id));
		await grant(members[3] ?? "", 5, q(other?.id));
		await grant(members[3] ?? "", 500, q(other?.id), "daily_cap");
		await grant(suspended, 999, q(tagged?.id));
		await grant(bot, 999, q(tagged?.id));
		await grant(tiny[0] ?? "", 100, q(tagged?.id));
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
		await db.delete(answers).where(inArray(answers.authorId, ids));
		await db.delete(questions).where(inArray(questions.authorId, ids));
		await db.delete(user).where(inArray(user.id, [bot]));
		await db.delete(user).where(inArray(user.id, ids));
	});

	test("ranks a country's Members by counted Reputation, humans in good standing only", async () => {
		const ranking = await api.rankings.byCountry({ country: big, limit: 20 });
		expect(ranking.items.map((m) => [m.rank, m.id, m.reputation])).toEqual([
			[1, members[0] as string, 30],
			[2, members[1] as string, 20],
			[3, members[2] as string, 10],
			[4, members[3] as string, 5], // the cancelled 500 is not counted
			[5, members[4] as string, 0],
			[6, members[5] as string, 0],
		]);
		const ids = ranking.items.map((m) => m.id);
		expect(ids).not.toContain(suspended);
		expect(ids).not.toContain(bot);
		expect(ranking.nextCursor).toBeNull();
	});

	test("paginates, and rejects a cursor it did not issue", async () => {
		const first = await api.rankings.byCountry({ country: big, limit: 4 });
		expect(first.items).toHaveLength(4);
		expect(first.nextCursor).not.toBeNull();
		const second = await api.rankings.byCountry({
			country: big,
			limit: 4,
			cursor: first.nextCursor ?? undefined,
		});
		expect(second.items.map((m) => m.rank)).toEqual([5, 6]);
		expect(second.nextCursor).toBeNull();
		await expect(
			api.rankings.byCountry({ country: big, limit: 4, cursor: "nope" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("a country under 5 Members is neither listed nor ranked", async () => {
		const countries = await api.rankings.countries();
		expect(countries.items.map((c) => c.country)).toContain(big);
		expect(countries.items.map((c) => c.country)).not.toContain(small);
		expect(countries.items.find((c) => c.country === big)).toEqual({
			country: big,
			members: 6,
			reputation: 65,
		});
		expect(await api.rankings.byCountry({ country: small, limit: 20 })).toEqual(
			{ items: [], nextCursor: null },
		);
	});

	test("ranks Members by Reputation earned on a Tag, through Answers too", async () => {
		const ranking = await api.rankings.byTag({ tag, limit: 20 });
		expect(ranking.items.map((m) => [m.rank, m.id, m.reputation])).toEqual([
			// The 100 of a Member of a small country shows here: the Tag ranking has no country rule.
			[1, tiny[0] as string, 100],
			[2, members[0] as string, 30],
			[3, members[1] as string, 20],
		]);
		// The small country is not revealed; the big one is.
		expect(ranking.items.map((m) => m.country)).toEqual([null, big, big]);
		expect(
			(await api.rankings.byTag({ tag: tag.toUpperCase(), limit: 5 })).items,
		).toHaveLength(3);
		expect(
			(await api.rankings.byTag({ tag: "no-such-tag", limit: 5 })).items,
		).toEqual([]);
	});
});
