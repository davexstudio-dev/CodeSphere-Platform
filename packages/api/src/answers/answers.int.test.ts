/// <reference types="bun" />
// Integration test of the answers, votes and write limits through the router, against a real
// Postgres (#70, #71, #72): each procedure's nominal path and its typed errors.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { user } from "@codesphere/db/schema/auth";
import { answers, questions, votes } from "@codesphere/db/schema/questions";
import { reputationEvents } from "@codesphere/db/schema/reputation";
import { createRouterClient } from "@orpc/server";
import { eq, inArray, or } from "drizzle-orm";

import { appRouter } from "../routers";
import { testContext } from "../test-context";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("answers, votes and limits on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID();
	const asker = `it-a-asker-${run}`;
	const helper = `it-a-helper-${run}`;
	const voter = `it-a-voter-${run}`;
	const robot = `it-a-robot-${run}`;
	const spammer = `it-a-spammer-${run}`;
	const admin = `it-a-admin-${run}`;
	const ids = [asker, helper, voter, robot, spammer, admin];

	const session = (id: string, kind = "human", role = "member") =>
		({
			user: { id, role, kind },
			session: { id: `s-${id}` },
		}) as unknown as Session;
	const clientAs = (s: Session | null) =>
		createRouterClient(appRouter, {
			context: testContext({ db, session: s }),
		});
	const asAsker = clientAs(session(asker));
	const asHelper = clientAs(session(helper));
	const asVoter = clientAs(session(voter));
	const asRobot = clientAs(session(robot, "agent"));
	const asSpammer = clientAs(session(spammer));
	const asAdmin = clientAs(session(admin, "human", "admin"));
	const anonymous = clientAs(null);

	// Seeded directly, so the Question limit (10 per hour and Member) is only spent where it is tested.
	const ask = async (authorId = asker) => {
		const [row] = await db
			.insert(questions)
			.values({
				authorId,
				idempotencyKey: crypto.randomUUID(),
				title: "How do I index?",
				body: "Use **an index**.",
				bodyHtml: "<p>Use <strong>an index</strong>.</p>",
				language: "en",
				tags: ["sql"],
			})
			.returning();
		if (!row) {
			throw new Error("seed failed");
		}
		return { id: row.id, version: row.version };
	};
	const askViaApi = (client: typeof asAsker) =>
		client.questions.create({
			idempotencyKey: crypto.randomUUID(),
			title: "How do I index?",
			body: "Use **an index**.",
			language: "en",
			tags: ["sql"],
		});
	const answer = (
		questionId: string,
		client = asHelper,
		body = "Try **this**.",
	) =>
		client.answers.create({
			idempotencyKey: crypto.randomUUID(),
			questionId,
			body,
		});

	beforeAll(async () => {
		await db.insert(user).values(
			ids.map((id) => ({
				id,
				name: id,
				email: `${id}@example.com`,
				role: id === admin ? ("admin" as const) : ("member" as const),
				kind: id === robot ? "agent" : "human",
			})),
		);
	});

	afterAll(async () => {
		const owned = await db
			.select({ id: questions.id })
			.from(questions)
			.where(inArray(questions.authorId, ids));
		const questionIds = owned.map((q) => q.id);
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
		await db.delete(auditLog).where(inArray(auditLog.actorId, ids));
		if (questionIds.length > 0) {
			await db.delete(questions).where(inArray(questions.id, questionIds));
		}
		await db.delete(user).where(inArray(user.id, ids));
	});

	describe("answers (#70)", () => {
		test("create renders the Markdown; a replayed key returns the same answer", async () => {
			const q = await ask();
			const key = crypto.randomUUID();
			const input = { idempotencyKey: key, questionId: q.id, body: "**ok**" };
			const first = await asHelper.answers.create(input);
			expect(first).toMatchObject({
				authorId: helper,
				score: 0,
				accepted: false,
				version: 1,
			});
			expect(first.bodyHtml).toContain("<strong>ok</strong>");
			expect((await asHelper.answers.create(input)).id).toBe(first.id);
		});

		test("a second answer from the same Member is a CONFLICT; one's own Question is allowed", async () => {
			const q = await ask();
			await answer(q.id);
			await expect(answer(q.id)).rejects.toMatchObject({ code: "CONFLICT" });
			await expect(answer(q.id, asAsker)).resolves.toMatchObject({
				authorId: asker,
			});
		});

		test("create is UNAUTHORIZED anonymously, NOT_FOUND for an unknown Question, CONFLICT when closed", async () => {
			const q = await ask();
			await expect(answer(q.id, anonymous)).rejects.toMatchObject({
				code: "UNAUTHORIZED",
			});
			await expect(answer(crypto.randomUUID(), asHelper)).rejects.toMatchObject(
				{ code: "NOT_FOUND" },
			);
			await asAsker.questions.close({ id: q.id, expectedVersion: q.version });
			await expect(answer(q.id)).rejects.toMatchObject({ code: "CONFLICT" });
		});

		test("update is for the author, guarded by expectedVersion", async () => {
			const q = await ask();
			const a = await answer(q.id);
			await expect(
				asVoter.answers.update({ id: a.id, expectedVersion: 1, body: "x" }),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			const updated = await asHelper.answers.update({
				id: a.id,
				expectedVersion: 1,
				body: "edited",
			});
			expect(updated).toMatchObject({ body: "edited", version: 2 });
			await expect(
				asHelper.answers.update({ id: a.id, expectedVersion: 1, body: "y" }),
			).rejects.toMatchObject({
				code: "CONFLICT",
				data: { version: 2 },
			});
		});

		test("accept: only the Question's author, changeable, makes it answered", async () => {
			const q = await ask();
			const a1 = await answer(q.id, asHelper);
			const a2 = await answer(q.id, asVoter);
			await expect(
				asHelper.answers.accept({ id: a1.id }),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			await expect(
				asAsker.answers.accept({ id: crypto.randomUUID() }),
			).rejects.toMatchObject({ code: "NOT_FOUND" });

			expect(await asAsker.answers.accept({ id: a1.id })).toMatchObject({
				accepted: true,
			});
			expect((await asAsker.questions.get({ id: q.id })).status).toBe(
				"answered",
			);
			await asAsker.answers.accept({ id: a2.id });
			const { items } = await asAsker.answers.list({ questionId: q.id });
			expect(items.map((a) => [a.id, a.accepted])).toEqual([
				[a2.id, true],
				[a1.id, false],
			]);
		});

		test("deleting the Accepted answer reopens the Question; delete is author only", async () => {
			const q = await ask();
			const a = await answer(q.id);
			await asAsker.answers.accept({ id: a.id });
			await expect(
				asVoter.answers.delete({ id: a.id, expectedVersion: 1 }),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			await expect(
				asHelper.answers.delete({ id: a.id, expectedVersion: 9 }),
			).rejects.toMatchObject({ code: "CONFLICT" });
			await asHelper.answers.delete({ id: a.id, expectedVersion: 1 });
			expect((await asAsker.questions.get({ id: q.id })).status).toBe("open");
			expect((await asAsker.answers.list({ questionId: q.id })).items).toEqual(
				[],
			);
		});
	});

	describe("votes (#71)", () => {
		test("an Agent is FORBIDDEN, an anonymous caller UNAUTHORIZED", async () => {
			const q = await ask();
			await expect(
				asRobot.votes.cast({
					targetType: "question",
					targetId: q.id,
					value: "up",
				}),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			await expect(
				anonymous.votes.cast({
					targetType: "question",
					targetId: q.id,
					value: "up",
				}),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		});

		test("a vote on one's own Question or Answer is FORBIDDEN; an unknown target NOT_FOUND", async () => {
			const q = await ask();
			const a = await answer(q.id);
			await expect(
				asAsker.votes.cast({
					targetType: "question",
					targetId: q.id,
					value: "up",
				}),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			await expect(
				asHelper.votes.cast({
					targetType: "answer",
					targetId: a.id,
					value: "up",
				}),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			await expect(
				asVoter.votes.retract({
					targetType: "answer",
					targetId: crypto.randomUUID(),
				}),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		});

		test("changing then retracting a vote keeps the Score up to date", async () => {
			const q = await ask();
			const a = await answer(q.id);
			const target = { targetType: "answer" as const, targetId: a.id };

			expect(await asVoter.votes.cast({ ...target, value: "up" })).toEqual({
				score: 1,
				vote: "up",
			});
			expect(await asAsker.votes.cast({ ...target, value: "up" })).toEqual({
				score: 2,
				vote: "up",
			});
			// One vote per Member and target: changing it replaces it.
			expect(await asVoter.votes.cast({ ...target, value: "down" })).toEqual({
				score: 0,
				vote: "down",
			});
			expect(await asVoter.votes.retract(target)).toEqual({
				score: 1,
				vote: null,
			});
			const { items } = await asAsker.answers.list({ questionId: q.id });
			expect(items[0]?.score).toBe(1);
		});

		test("votes on a Question feed its Score", async () => {
			const q = await ask();
			await asVoter.votes.cast({
				targetType: "question",
				targetId: q.id,
				value: "up",
			});
			const [row] = await db
				.select({ score: questions.score })
				.from(questions)
				.where(eq(questions.id, q.id));
			expect(row?.score).toBe(1);
		});
	});

	describe("write limits (#72)", () => {
		test("the 11th Question within the hour is TOO_MANY_REQUESTS with retryAfter", async () => {
			for (let i = 0; i < 10; i++) {
				await askViaApi(asSpammer);
			}
			await expect(askViaApi(asSpammer)).rejects.toMatchObject({
				code: "TOO_MANY_REQUESTS",
				data: { retryAfter: expect.any(Number) },
			});
			// Another Member is not affected.
			await expect(askViaApi(asAsker)).resolves.toBeDefined();
		});

		test("the 31st Answer within the hour is TOO_MANY_REQUESTS", async () => {
			// Seeded directly: asking 31 Questions would hit the Question limit first.
			const rows = await db
				.insert(questions)
				.values(
					Array.from({ length: 31 }, () => ({
						authorId: admin,
						idempotencyKey: crypto.randomUUID(),
						title: "Seeded",
						body: "b",
						bodyHtml: "<p>b</p>",
						language: "en" as const,
						tags: ["sql"],
					})),
				)
				.returning({ id: questions.id });
			const questionIds = rows.map((r) => r.id);
			for (const id of questionIds.slice(0, 30)) {
				await answer(id, asSpammer);
			}
			const refused = await answer(questionIds[30] as string, asSpammer).catch(
				(e) => e,
			);
			expect(refused).toMatchObject({
				code: "TOO_MANY_REQUESTS",
				data: { retryAfter: expect.any(Number) },
			});
		});
	});

	describe("close and reopen (#52)", () => {
		test("an author reopens their closed Question; reopening an open one is a CONFLICT", async () => {
			const q = await ask();
			const closed = await asAsker.questions.close({
				id: q.id,
				expectedVersion: q.version,
			});
			expect(closed.status).toBe("closed");
			const reopened = await asAsker.questions.reopen({
				id: q.id,
				expectedVersion: closed.version,
			});
			expect(reopened.status).toBe("open");
			await expect(
				asAsker.questions.reopen({
					id: q.id,
					expectedVersion: reopened.version,
				}),
			).rejects.toMatchObject({ code: "CONFLICT" });
		});

		test("a non-author is FORBIDDEN; an admin reopens and the event is audited", async () => {
			const q = await ask();
			const closed = await asAsker.questions.close({
				id: q.id,
				expectedVersion: q.version,
			});
			await expect(
				asVoter.questions.reopen({ id: q.id, expectedVersion: closed.version }),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			await expect(
				anonymous.questions.reopen({
					id: q.id,
					expectedVersion: closed.version,
				}),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });

			const reopened = await asAdmin.questions.reopen({
				id: q.id,
				expectedVersion: closed.version,
			});
			expect(reopened.status).toBe("open");
			const events = await db
				.select()
				.from(auditLog)
				.where(eq(auditLog.targetId, q.id));
			expect(events.map((e) => e.action)).toEqual(["question.reopen"]);
		});

		test("an admin closing someone's Question is audited as question.close", async () => {
			const q = await ask();
			await asAdmin.questions.close({ id: q.id, expectedVersion: q.version });
			const events = await db
				.select()
				.from(auditLog)
				.where(eq(auditLog.targetId, q.id));
			expect(events.map((e) => e.action)).toEqual(["question.close"]);
		});
	});
});
