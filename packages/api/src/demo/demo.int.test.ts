/// <reference types="bun" />
// Integration test of the CADEV demo content (#57) against a real Postgres: it loads through the
// services, replays without changing anything, gives every demo Member some Reputation, and
// creates the demo Agent once for its Owner.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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
// Each run loads the whole content (dozens of Answers and Votes): far more than the default 5 s.
const SEED_TIMEOUT = 60_000;

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

	// Run before as well: a hand-run `db:seed:demo` may have left the demo Members in this database.
	const clean = async () => {
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
	};
	beforeAll(clean);
	afterAll(clean);

	test(
		"loads the Members, Questions, Answers and acceptances, and replays without change",
		async () => {
			// A Member left by an earlier version of the content, under its old name.
			await db.insert(user).values({
				...demoMembers[0],
				name: `${demoMembers[0].name} (démo)`,
				kind: "human",
			});
			const first = await seedDemo(db);
			const [renamed] = await db
				.select({ name: user.name })
				.from(user)
				.where(eq(user.id, demoMembers[0].id));
			expect(renamed?.name).toBe(demoMembers[0].name);
			expect(first).toMatchObject({
				members: demoMembers.length,
				questions: demoQuestions.length,
				agent: null,
			});
			const acceptedInContent = demoQuestions.filter((q) =>
				q.answers.some((a) => a.accepted),
			).length;
			expect(first.accepted).toBe(acceptedInContent);
			const rows = await demoQuestionRows();
			expect(rows).toHaveLength(demoQuestions.length);
			const accepted = await db
				.select({ id: questions.id })
				.from(questions)
				.where(eq(questions.status, "answered"));
			expect(
				accepted.filter((q) => rows.some((r) => r.id === q.id)),
			).toHaveLength(acceptedInContent);
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
		},
		SEED_TIMEOUT,
	);

	test(
		"creates the demo Agent once for a Member who signed in, and refuses an unknown email",
		async () => {
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
		},
		SEED_TIMEOUT,
	);
});
