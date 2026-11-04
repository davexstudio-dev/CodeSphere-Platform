/// <reference types="bun" />
// Anti-farming rules of the Reputation journal, against Postgres (#241).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import { answers, questions, votes } from "@codesphere/db/schema/questions";
import { reputationEvents } from "@codesphere/db/schema/reputation";
import { createRouterClient } from "@orpc/server";
import { eq, inArray, or } from "drizzle-orm";

import { appRouter } from "../routers";
import { testContext } from "../test-context";
import { createVoteService } from "../votes/service";
import { FARMING_LIMITS, type FarmingLimits } from "./farming";
import { reputationOf } from "./read";

const url = process.env.TEST_DATABASE_URL;
const DAY = 86_400_000;
const NO_PRIVILEGE_THRESHOLDS = {
	flag: 0,
	propose_tag_edit: 0,
	downvote: 0,
	close_vote: 0,
	edit_tags: 0,
	submit_feed_item: 0,
};

describe.skipIf(!url)("anti-farming on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID();
	const author = `it-farm-author-${run}`;
	const veteran = `it-farm-vet-${run}`; // account 30 days old
	const veteran2 = `it-farm-vet2-${run}`;
	const rookie = `it-farm-rookie-${run}`; // account created now
	const admin = `it-farm-admin-${run}`;
	const ids = [author, veteran, veteran2, rookie, admin];
	const questionIds: string[] = [];
	const answerIds: string[] = [];

	const vote = (limits: FarmingLimits = FARMING_LIMITS) =>
		createVoteService(db, NO_PRIVILEGE_THRESHOLDS, limits);
	const reputation = async (id: string) =>
		(await reputationOf(db, { id, kind: "human" })) ?? 0;
	const journal = (userId: string) =>
		db
			.select()
			.from(reputationEvents)
			.where(eq(reputationEvents.userId, userId));
	const asAdmin = () =>
		createRouterClient(appRouter, {
			context: testContext({
				db,
				session: {
					user: { id: admin, role: "admin", kind: "human" },
					session: { id: "s" },
				} as unknown as Session,
			}),
		});

	const newQuestion = async () => {
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
		questionIds.push(q?.id ?? "");
		return q?.id ?? "";
	};
	const newAnswer = async (questionId: string) => {
		const [a] = await db
			.insert(answers)
			.values({
				questionId,
				authorId: author,
				idempotencyKey: crypto.randomUUID(),
				body: "a",
				bodyHtml: "<p>a</p>",
			})
			.returning();
		answerIds.push(a?.id ?? "");
		return a?.id ?? "";
	};

	beforeAll(async () => {
		const old = new Date(Date.now() - 30 * DAY);
		await db.insert(user).values(
			ids.map((id) => ({
				id,
				name: id,
				email: `${id}@example.com`,
				role: id === admin ? ("admin" as const) : ("member" as const),
				createdAt: id === rookie ? new Date() : old,
			})),
		);
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

	test("a vote from an account under 7 days old earns nothing, and says why", async () => {
		const target = {
			targetType: "question" as const,
			targetId: await newQuestion(),
		};
		const before = await reputation(author);
		await vote().cast(rookie, target, "up");
		expect(await reputation(author)).toBe(before);
		const voided = (await journal(author)).filter((e) => e.actorId === rookie);
		expect(voided).toMatchObject([
			{ voidedReason: "new_account", points: 5, kind: "upvote_received" },
		]);
		// Settling the same vote again does not stack voided rows.
		await vote().cast(rookie, target, "up");
		expect(
			(await journal(author)).filter((e) => e.actorId === rookie),
		).toHaveLength(1);
		// An older account's vote on the same kind of target counts.
		const other = {
			targetType: "question" as const,
			targetId: await newQuestion(),
		};
		await vote().cast(veteran, other, "up");
		expect(await reputation(author)).toBe(before + 5);
	});

	test("a Member cannot gain more than the daily cap; the rest is journalled voided", async () => {
		const limits = { ...FARMING_LIMITS, dailyGainCap: 5 };
		const [fresh] = await db
			.insert(user)
			.values({
				id: `it-farm-cap-${run}`,
				name: "cap",
				email: `cap-${run}@example.com`,
			})
			.returning();
		ids.push(fresh?.id ?? "");
		const capped = fresh?.id ?? "";
		const [q] = await db
			.insert(questions)
			.values({
				authorId: capped,
				idempotencyKey: crypto.randomUUID(),
				title: "Q",
				body: "b",
				bodyHtml: "<p>b</p>",
				language: "en",
				tags: ["sql"],
			})
			.returning();
		questionIds.push(q?.id ?? "");
		const a1 = await db
			.insert(answers)
			.values({
				questionId: q?.id ?? "",
				authorId: capped,
				idempotencyKey: crypto.randomUUID(),
				body: "a",
				bodyHtml: "<p>a</p>",
			})
			.returning();
		answerIds.push(a1[0]?.id ?? "");

		// +10 for an upvote on an answer, cap 5: 5 counted, 5 voided.
		await vote(limits).cast(
			veteran,
			{ targetType: "answer", targetId: a1[0]?.id ?? "" },
			"up",
		);
		expect(await reputation(capped)).toBe(5);
		expect(
			(await journal(capped)).filter((e) => e.voidedReason === "daily_cap"),
		).toMatchObject([{ points: 5 }]);

		// The day's room is spent: the next vote is voided entirely.
		await vote(limits).cast(
			veteran2,
			{ targetType: "question", targetId: q?.id ?? "" },
			"up",
		);
		expect(await reputation(capped)).toBe(5);

		// Retracting gives back only what had counted.
		await vote(limits).retract(veteran, {
			targetType: "answer",
			targetId: a1[0]?.id ?? "",
		});
		expect(await reputation(capped)).toBe(0);
	});

	test("a voter's votes beyond the repeat limit are cancelled and reported to the Admins", async () => {
		const limits = { ...FARMING_LIMITS, repeatVoterMax: 2 };
		const targets = [
			await newQuestion(),
			await newQuestion(),
			await newQuestion(),
		];
		const before = await reputation(author);
		for (const targetId of targets) {
			await vote(limits).cast(
				veteran2,
				{ targetType: "question", targetId },
				"up",
			);
		}
		// Two counted (+5 each), the third voided.
		expect(await reputation(author)).toBe(before + 10);
		const flagged = await asAdmin().admin.reputationFlags.list({ limit: 50 });
		const mine = flagged.items.filter((f) => f.voter.id === veteran2);
		expect(mine).toMatchObject([
			{
				reason: "repeat_voter",
				points: 5,
				author: { id: author },
				targetType: "question",
				targetId: targets[2],
			},
		]);
		// Retracting the cancelled vote changes nothing.
		await vote(limits).retract(veteran2, {
			targetType: "question",
			targetId: targets[2] ?? "",
		});
		expect(await reputation(author)).toBe(before + 10);
	});

	test("a vote retracted and cast again does not use the daily cap up twice", async () => {
		const limits = { ...FARMING_LIMITS, dailyGainCap: 10 };
		// A fresh author: the shared one has gained more than 10 today in the tests above.
		const owner = `it-farm-cycle-${run}`;
		await db
			.insert(user)
			.values({ id: owner, name: owner, email: `${owner}@example.com` });
		ids.push(owner);
		const [q] = await db
			.insert(questions)
			.values({
				authorId: owner,
				idempotencyKey: crypto.randomUUID(),
				title: "Q",
				body: "b",
				bodyHtml: "<p>b</p>",
				language: "en",
				tags: ["sql"],
			})
			.returning();
		questionIds.push(q?.id ?? "");
		const target = { targetType: "question" as const, targetId: q?.id ?? "" };
		for (let cycle = 0; cycle < 4; cycle++) {
			await vote(limits).cast(veteran, target, "up");
			await vote(limits).retract(veteran, target);
		}
		await vote(limits).cast(veteran, target, "up");
		// +5 for a Question, net, whatever the cycles: the cap of 10 was never reached.
		expect(await reputation(owner)).toBe(5);
		expect(
			(await journal(owner)).filter((e) => e.voidedReason === "daily_cap"),
		).toHaveLength(0);
	});

	test("votes since retracted do not count towards the repeat limit", async () => {
		const limits = { ...FARMING_LIMITS, repeatVoterMax: 1 };
		const [first, second] = [await newQuestion(), await newQuestion()];
		const before = await reputation(author);
		const voter = `it-farm-retract-${run}`;
		await db.insert(user).values({
			id: voter,
			name: voter,
			email: `${voter}@example.com`,
			createdAt: new Date(Date.now() - 30 * DAY),
		});
		ids.push(voter);
		await vote(limits).cast(
			voter,
			{ targetType: "question", targetId: first },
			"up",
		);
		await vote(limits).retract(voter, {
			targetType: "question",
			targetId: first,
		});
		// The first vote is gone: the second is the voter's only one, within the limit of 1.
		await vote(limits).cast(
			voter,
			{ targetType: "question", targetId: second },
			"up",
		);
		expect(await reputation(author)).toBe(before + 5);
		expect(
			(await journal(author)).filter(
				(e) => e.actorId === voter && e.voidedReason === "repeat_voter",
			),
		).toHaveLength(0);
	});

	test("the account age is judged when the vote is cast or changed, not at its first date", async () => {
		const young = `it-farm-young-${run}`;
		await db
			.insert(user)
			.values({ id: young, name: young, email: `${young}@example.com` });
		ids.push(young);
		const target = {
			targetType: "question" as const,
			targetId: await newQuestion(),
		};
		const before = await reputation(author);
		await vote().cast(young, target, "up");
		expect(await reputation(author)).toBe(before);
		// The account ages past 7 days; the Member changes then restores their vote.
		await db
			.update(user)
			.set({ createdAt: new Date(Date.now() - 30 * DAY) })
			.where(eq(user.id, young));
		await vote().cast(young, target, "down");
		await vote().cast(young, target, "up");
		expect(await reputation(author)).toBe(before + 5);
	});

	test("what a cap already cancelled is not counted again when room appears", async () => {
		const [capped] = await db
			.insert(user)
			.values({
				id: `it-farm-regrant-${run}`,
				name: "regrant",
				email: `regrant-${run}@example.com`,
			})
			.returning();
		const owner = capped?.id ?? "";
		ids.push(owner);
		const [q] = await db
			.insert(questions)
			.values({
				authorId: owner,
				idempotencyKey: crypto.randomUUID(),
				title: "Q",
				body: "b",
				bodyHtml: "<p>b</p>",
				language: "en",
				tags: ["sql"],
			})
			.returning();
		questionIds.push(q?.id ?? "");
		const target = { targetType: "question" as const, targetId: q?.id ?? "" };
		await vote({ ...FARMING_LIMITS, dailyGainCap: 0 }).cast(
			veteran,
			target,
			"up",
		);
		expect(await reputation(owner)).toBe(0);
		// Same vote settled again once the cap would allow it: still one journal line, voided.
		await vote({ ...FARMING_LIMITS, dailyGainCap: 200 }).cast(
			veteran,
			target,
			"up",
		);
		expect(await reputation(owner)).toBe(0);
		expect(await journal(owner)).toMatchObject([
			{ voidedReason: "daily_cap", points: 5 },
		]);
	});

	test("acceptance also counts against the daily cap", async () => {
		const limits = { ...FARMING_LIMITS, dailyGainCap: 0 };
		const q = await newQuestion();
		const a = await newAnswer(q);
		const { settleAcceptance } = await import("./service");
		const [asker] = await db
			.insert(user)
			.values({
				id: `it-farm-asker-${run}`,
				name: "asker",
				email: `asker-${run}@example.com`,
			})
			.returning();
		ids.push(asker?.id ?? "");
		await db
			.update(questions)
			.set({ authorId: asker?.id ?? "", acceptedAnswerId: a })
			.where(eq(questions.id, q));
		const before = await reputation(author);
		await settleAcceptance(db, q, limits);
		expect(await reputation(author)).toBe(before);
		expect(
			(await journal(author)).some(
				(e) => e.voidedReason === "daily_cap" && e.kind === "answer_accepted",
			),
		).toBe(true);
	});

	test("the Admins' list is for staff only", async () => {
		const member = createRouterClient(appRouter, {
			context: testContext({
				db,
				session: {
					user: { id: author, role: "member", kind: "human" },
					session: { id: "s" },
				} as unknown as Session,
			}),
		});
		await expect(
			member.admin.reputationFlags.list({ limit: 5 }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});
