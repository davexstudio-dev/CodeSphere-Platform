/// <reference types="bun" />
// Integration test of the CADEV demo content (#57) against a real Postgres: it loads through the
// services, replays without changing anything, gives every demo Member some Reputation, and
// creates the demo Agent once for its Owner.
import { afterAll, describe, expect, test } from "bun:test";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { apikey, user } from "@codesphere/db/schema/auth";
import { answers, questions, votes } from "@codesphere/db/schema/questions";
import { reputationEvents } from "@codesphere/db/schema/reputation";
import { count, eq, inArray, or } from "drizzle-orm";

import { reputationOf } from "../reputation/service";
import { demoMembers, demoQuestions } from "./content";
import { DEMO_AGENT_NAME, DemoSeedError, seedDemo } from "./seed";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("demo content on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID();
	const owner = `it-demo-owner-${run}`;
	const ownerEmail = `${owner}@example.com`;
	const memberIds = demoMembers.map((m) => m.id);
	const people = [...memberIds, owner];

	const journalSize = async () => {
		const [row] = await db
			.select({ n: count() })
			.from(reputationEvents)
			.where(inArray(reputationEvents.userId, memberIds));
		return row?.n ?? 0;
	};
	const demoQuestionRows = () =>
		db
			.select({ id: questions.id, version: questions.version })
			.from(questions)
			.where(inArray(questions.authorId, memberIds))
			.orderBy(questions.id);

	afterAll(async () => {
		const agents = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.ownerId, owner));
		const agentIds = agents.map((a) => a.id);
		await db
			.delete(reputationEvents)
			.where(
				or(
					inArray(reputationEvents.userId, people),
					inArray(reputationEvents.actorId, people),
				),
			);
		await db.delete(votes).where(inArray(votes.userId, people));
		await db.delete(answers).where(inArray(answers.authorId, people));
		await db.delete(questions).where(inArray(questions.authorId, people));
		await db.delete(auditLog).where(eq(auditLog.actorId, owner));
		if (agentIds.length > 0) {
			await db.delete(apikey).where(inArray(apikey.referenceId, agentIds));
			await db.delete(user).where(inArray(user.id, agentIds));
		}
		await db.delete(user).where(inArray(user.id, people));
	});

	test("loads the Members, Questions, Answers and acceptances, and replays without change", async () => {
		const first = await seedDemo(db);
		expect(first).toMatchObject({
			members: demoMembers.length,
			questions: demoQuestions.length,
			agent: null,
		});
		expect(first.accepted).toBe(3);
		const rows = await demoQuestionRows();
		expect(rows).toHaveLength(demoQuestions.length);
		const accepted = await db
			.select({ id: questions.id })
			.from(questions)
			.where(eq(questions.status, "answered"));
		expect(
			accepted.filter((q) => rows.some((r) => r.id === q.id)),
		).toHaveLength(3);
		for (const member of demoMembers) {
			expect(
				await reputationOf(db, { id: member.id, kind: "human" }),
			).toBeGreaterThan(0);
		}

		const before = { journal: await journalSize(), rows };
		const second = await seedDemo(db);
		expect(second).toEqual(first);
		expect(await journalSize()).toBe(before.journal);
		expect(await demoQuestionRows()).toEqual(before.rows);
	});

	test("creates the demo Agent once for a Member who signed in, and refuses an unknown email", async () => {
		await expect(
			seedDemo(db, { ownerEmail: `nobody-${run}@example.com` }),
		).rejects.toBeInstanceOf(DemoSeedError);

		await db
			.insert(user)
			.values({ id: owner, name: "Owner", email: ownerEmail, kind: "human" });
		const first = await seedDemo(db, { ownerEmail });
		expect(first.agent).toMatchObject({ created: true });
		expect(first.agent?.key).toBeTruthy();
		const second = await seedDemo(db, { ownerEmail });
		expect(second.agent).toMatchObject({ created: false, key: null });
		expect(second.agent?.id).toBe(first.agent?.id as string);
		const agents = await db
			.select({ name: user.name, kind: user.kind })
			.from(user)
			.where(eq(user.ownerId, owner));
		expect(agents).toEqual([{ name: DEMO_AGENT_NAME, kind: "agent" }]);
	});
});
