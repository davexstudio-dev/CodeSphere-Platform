/// <reference types="bun" />
// Integration test of the Reputation journal (#239) through the router, against a real Postgres:
// each Vote, retraction and acceptance appends the expected events, and the Reputation is their sum.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import { answers, questions, votes } from "@codesphere/db/schema/questions";
import { reputationEvents } from "@codesphere/db/schema/reputation";
import { createRouterClient } from "@orpc/server";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

import { appRouter } from "../routers";
import { testContext } from "../test-context";
import { REPUTATION_POINTS } from "./service";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Reputation journal on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID();
	const asker = `it-r-asker-${run}`;
	const helper = `it-r-helper-${run}`;
	const other = `it-r-other-${run}`;
	const voter = `it-r-voter-${run}`;
	const owner = `it-r-owner-${run}`;
	const robot = `it-r-robot-${run}`;
	const ids = [asker, helper, other, voter, owner, robot];

	const session = (id: string, kind = "human") =>
		({
			user: { id, role: "member", kind },
			session: { id: `s-${id}` },
		}) as unknown as Session;
	const clientAs = (id: string, kind = "human") =>
		createRouterClient(appRouter, {
			context: testContext({ db, session: session(id, kind) }),
		});
	const asAsker = clientAs(asker);
	const asVoter = clientAs(voter);
	const asOwner = clientAs(owner);
	const anonymous = createRouterClient(appRouter, {
		context: testContext({ db, session: null }),
	});

	const ask = async (authorId = asker) => {
		const [row] = await db
			.insert(questions)
			.values({
				authorId,
				idempotencyKey: crypto.randomUUID(),
				title: "How do I index?",
				body: "Use an index.",
				bodyHtml: "<p>Use an index.</p>",
				language: "en",
				tags: ["sql"],
			})
			.returning();
		if (!row) {
			throw new Error("seed failed");
		}
		return row.id;
	};
	const answer = (questionId: string, authorId: string) =>
		clientAs(authorId).answers.create({
			idempotencyKey: crypto.randomUUID(),
			questionId,
			body: "Try this.",
		});
	// Seeded directly: posting through the API would need the Agent's key preset.
	const agentAnswer = async (questionId: string) => {
		const [row] = await db
			.insert(answers)
			.values({
				questionId,
				authorId: robot,
				idempotencyKey: crypto.randomUUID(),
				body: "Try this.",
				bodyHtml: "<p>Try this.</p>",
			})
			.returning();
		if (!row) {
			throw new Error("seed failed");
		}
		return row;
	};

	// Each test starts from an empty journal, so a Member's Reputation is what that test earned.
	const reset = async () => {
		await db
			.delete(reputationEvents)
			.where(
				or(
					inArray(reputationEvents.userId, ids),
					inArray(reputationEvents.actorId, ids),
				),
			);
	};
	const reputation = async (id: string) =>
		(await anonymous.members.get({ id })).reputation;
	const journal = (id: string) =>
		db
			.select({
				kind: reputationEvents.kind,
				points: reputationEvents.points,
			})
			.from(reputationEvents)
			.where(eq(reputationEvents.userId, id))
			.orderBy(asc(reputationEvents.createdAt));

	beforeAll(async () => {
		await db.insert(user).values(
			ids.map((id) => ({
				id,
				name: id,
				email: `${id}@example.com`,
				kind: id === robot ? "agent" : "human",
				ownerId: id === robot ? owner : null,
			})),
		);
	});

	afterAll(async () => {
		await reset();
		await db.delete(votes).where(inArray(votes.userId, ids));
		await db.delete(answers).where(inArray(answers.authorId, ids));
		await db.delete(questions).where(inArray(questions.authorId, ids));
		await db.delete(user).where(inArray(user.id, ids));
	});

	test("a Vote up on an Answer earns its author 10, on a Question 5", async () => {
		await reset();
		const q = await ask();
		const a = await answer(q, helper);
		await asVoter.votes.cast({
			targetType: "answer",
			targetId: a.id,
			value: "up",
		});
		await asVoter.votes.cast({
			targetType: "question",
			targetId: q,
			value: "up",
		});
		expect(await journal(helper)).toEqual([
			{ kind: "upvote_received", points: REPUTATION_POINTS.upvoteOnAnswer },
		]);
		expect(await reputation(helper)).toBe(10);
		expect(await reputation(asker)).toBe(5);
		expect(await reputation(voter)).toBe(0);
	});

	test("a Vote down costs its author 2 and the voter 1", async () => {
		await reset();
		const q = await ask();
		const a = await answer(q, helper);
		await asVoter.votes.cast({
			targetType: "answer",
			targetId: a.id,
			value: "down",
		});
		expect(await reputation(helper)).toBe(-2);
		expect(await reputation(voter)).toBe(-1);
	});

	test("retracting a Vote appends the opposite event: the journal grows, the sum returns to zero", async () => {
		await reset();
		const q = await ask();
		const a = await answer(q, helper);
		const target = { targetType: "answer" as const, targetId: a.id };
		await asVoter.votes.cast({ ...target, value: "up" });
		await asVoter.votes.retract(target);
		expect(await journal(helper)).toEqual([
			{ kind: "upvote_received", points: 10 },
			{ kind: "upvote_received", points: -10 },
		]);
		expect(await reputation(helper)).toBe(0);
		// Retracting again, or recasting the same Vote, writes nothing more than needed.
		await asVoter.votes.retract(target);
		await asVoter.votes.cast({ ...target, value: "up" });
		await asVoter.votes.cast({ ...target, value: "up" });
		expect(await journal(helper)).toHaveLength(3);
		expect(await reputation(helper)).toBe(10);
	});

	test("turning a Vote up into a Vote down cancels the gain and applies the cost", async () => {
		await reset();
		const q = await ask();
		const a = await answer(q, helper);
		const target = { targetType: "answer" as const, targetId: a.id };
		await asVoter.votes.cast({ ...target, value: "up" });
		await asVoter.votes.cast({ ...target, value: "down" });
		expect(await reputation(helper)).toBe(-2);
		expect(await reputation(voter)).toBe(-1);
		await asVoter.votes.retract(target);
		expect(await reputation(helper)).toBe(0);
		expect(await reputation(voter)).toBe(0);
	});

	test("an acceptance earns the author 15 and the Question's author 2; changing it moves the 15", async () => {
		await reset();
		const q = await ask();
		const first = await answer(q, helper);
		const second = await answer(q, other);
		await asAsker.answers.accept({ id: first.id });
		expect(await reputation(helper)).toBe(15);
		expect(await reputation(asker)).toBe(2);
		// Accepting the same Answer again changes nothing.
		await asAsker.answers.accept({ id: first.id });
		expect(await journal(helper)).toHaveLength(1);

		await asAsker.answers.accept({ id: second.id });
		expect(await reputation(helper)).toBe(0);
		expect(await reputation(other)).toBe(15);
		expect(await reputation(asker)).toBe(2);
		expect(await journal(helper)).toEqual([
			{ kind: "answer_accepted", points: 15 },
			{ kind: "answer_accepted", points: -15 },
		]);
	});

	test("deleting the Accepted answer cancels the acceptance's points", async () => {
		await reset();
		const q = await ask();
		const a = await answer(q, helper);
		await asAsker.answers.accept({ id: a.id });
		await clientAs(helper).answers.delete({ id: a.id, expectedVersion: 1 });
		expect(await reputation(helper)).toBe(0);
		expect(await reputation(asker)).toBe(0);
	});

	test("accepting one's own Answer earns nothing", async () => {
		await reset();
		const q = await ask();
		const a = await answer(q, asker);
		await asAsker.answers.accept({ id: a.id });
		expect(await reputation(asker)).toBe(0);
	});

	test("an Agent and its Owner earn nothing for what the Agent posts", async () => {
		await reset();
		const q = await ask();
		const a = await agentAnswer(q);
		await asVoter.votes.cast({
			targetType: "answer",
			targetId: a.id,
			value: "up",
		});
		await asAsker.answers.accept({ id: a.id });
		expect(await journal(robot)).toEqual([]);
		expect(await journal(owner)).toEqual([]);
		expect(await reputation(robot)).toBeNull();
		expect(await reputation(owner)).toBe(0);
		// The asker still gets the 2 for accepting, and the voter pays for a Vote down on an Agent.
		expect(await reputation(asker)).toBe(2);
		await asVoter.votes.cast({
			targetType: "answer",
			targetId: a.id,
			value: "down",
		});
		expect(await reputation(voter)).toBe(-1);
		expect(await journal(robot)).toEqual([]);
	});

	test("the Reputation shows on the Member's own profile", async () => {
		await reset();
		const q = await ask(owner);
		await asVoter.votes.cast({
			targetType: "question",
			targetId: q,
			value: "up",
		});
		expect((await asOwner.members.me()).reputation).toBe(5);
	});

	test("the journal points at its source", async () => {
		await reset();
		const q = await ask();
		await asVoter.votes.cast({
			targetType: "question",
			targetId: q,
			value: "up",
		});
		const [event] = await db
			.select()
			.from(reputationEvents)
			.where(
				and(
					eq(reputationEvents.userId, asker),
					eq(reputationEvents.targetId, q),
				),
			);
		expect(event).toMatchObject({
			cause: "vote",
			actorId: voter,
			targetType: "question",
		});
	});

	test("the author's Reputation comes with the Question, the listing and the Answers", async () => {
		await reset();
		const q = await ask();
		const a = await answer(q, helper);
		await agentAnswer(q);
		await asVoter.votes.cast({
			targetType: "answer",
			targetId: a.id,
			value: "up",
		});
		await asVoter.votes.cast({
			targetType: "question",
			targetId: q,
			value: "up",
		});
		expect((await anonymous.questions.get({ id: q })).authorReputation).toBe(5);
		const listed = await anonymous.questions.list({ q: "index", limit: 50 });
		expect(listed.items.find((item) => item.id === q)?.authorReputation).toBe(
			5,
		);
		const { items } = await anonymous.answers.list({ questionId: q });
		expect(items.map((i) => [i.authorId, i.authorReputation]).sort()).toEqual(
			[
				[helper, 10],
				[robot, null],
			].sort(),
		);
	});

	// The migration that replays the Votes and acceptances written before the journal existed.
	const backfill = async () => {
		const file = new URL(
			"../../../db/src/migrations/20261018165348_reputation_backfill/migration.sql",
			import.meta.url,
		);
		for (const statement of (await Bun.file(file).text()).split(
			"--> statement-breakpoint",
		)) {
			await db.execute(sql.raw(statement));
		}
	};

	test("the backfill replays earlier Votes and acceptances once, and settlements continue from it", async () => {
		await reset();
		// Only this test's Votes and acceptances: the backfill reads the whole database.
		await db.delete(votes).where(inArray(votes.userId, ids));
		await db
			.update(questions)
			.set({ acceptedAnswerId: null })
			.where(inArray(questions.authorId, ids));
		const q = await ask();
		const a = await answer(q, helper);
		const b = await agentAnswer(q);
		// Written as before #239: rows in votes and an Accepted answer, no event.
		await db.insert(votes).values([
			{ userId: voter, targetType: "answer", targetId: a.id, value: 1 },
			{ userId: voter, targetType: "question", targetId: q, value: -1 },
			{ userId: owner, targetType: "answer", targetId: b.id, value: 1 },
		]);
		await db
			.update(questions)
			.set({ acceptedAnswerId: a.id })
			.where(eq(questions.id, q));

		await backfill();
		expect(await reputation(helper)).toBe(10 + 15);
		expect(await reputation(asker)).toBe(-2 + 2);
		expect(await reputation(voter)).toBe(-1);
		expect(await journal(robot)).toEqual([]);
		expect(await reputation(owner)).toBe(0);

		await backfill();
		expect(await journal(helper)).toHaveLength(2);
		expect(await journal(asker)).toHaveLength(2);

		await asVoter.votes.retract({ targetType: "answer", targetId: a.id });
		expect(await reputation(helper)).toBe(15);
		await asAsker.answers.accept({ id: b.id });
		expect(await reputation(helper)).toBe(0);
		expect(await reputation(asker)).toBe(0);
	});
});
