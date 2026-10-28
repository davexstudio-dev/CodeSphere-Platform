/// <reference types="bun" />
// Integration test of the Agent activity history (#294) against Postgres: who may read it, and what
// it holds (an Answer, a pause and its end, the key events), most recent first, filtered and paged.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { agentPauses } from "@codesphere/db/schema/agents";
import { auditLog } from "@codesphere/db/schema/audit";
import { apikey, user } from "@codesphere/db/schema/auth";
import { answers, questions } from "@codesphere/db/schema/questions";
import { createRouterClient } from "@orpc/server";
import { inArray, like } from "drizzle-orm";

import { appRouter } from "../routers";
import { testContext } from "../test-context";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("agent activity history on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID();
	const owner = `it-act-owner-${run}`;
	const stranger = `it-act-stranger-${run}`;
	const auditor = `it-act-auditor-${run}`;
	const humans = [owner, stranger, auditor];
	let agentId = "";

	const session = (id: string, role = "member") =>
		({
			user: { id, role, kind: "human" },
			session: { id: `s-${id}` },
		}) as unknown as Session;
	const clientAs = (s: Session | null) =>
		createRouterClient(appRouter, {
			context: testContext({ db, session: s }),
		});

	beforeAll(async () => {
		await db
			.insert(user)
			.values(
				humans.map((id) => ({ id, name: id, email: `${id}@example.com` })),
			);
		({
			agent: { id: agentId },
		} = await clientAs(session(owner)).agents.create({
			name: "History bot",
			preset: "contribute",
		}));
		const [question] = await db
			.insert(questions)
			.values({
				authorId: owner,
				title: `History question ${run}`,
				body: "A body long enough for a Question.",
				bodyHtml: "<p>A body long enough for a Question.</p>",
				language: "en",
				tags: [],
				idempotencyKey: `q-${run}`,
			})
			.returning({ id: questions.id });
		await db.insert(answers).values({
			questionId: question?.id ?? "",
			authorId: agentId,
			body: "An Answer written by the Agent.",
			bodyHtml: "<p>An Answer written by the Agent.</p>",
			idempotencyKey: `a-${run}`,
			createdAt: new Date(Date.now() + 1000),
		});
		await db.insert(agentPauses).values({
			agentId,
			pausedAt: new Date(Date.now() + 2000),
			endedAt: new Date(Date.now() + 3000),
			endedBy: owner,
		});
	});

	afterAll(async () => {
		const all = [...humans, agentId];
		await db.delete(agentPauses).where(inArray(agentPauses.agentId, all));
		await db.delete(answers).where(inArray(answers.authorId, all));
		await db.delete(questions).where(inArray(questions.authorId, all));
		await db.delete(apikey).where(inArray(apikey.referenceId, all));
		await db.delete(auditLog).where(like(auditLog.targetId, `%${run}%`));
		await db.delete(auditLog).where(inArray(auditLog.actorId, all));
		await db.delete(user).where(inArray(user.id, all));
	});

	test("the Owner reads it, most recent first", async () => {
		const page = await clientAs(session(owner)).agents.activity({
			id: agentId,
		});
		expect(page.items.map((item) => item.kind)).toEqual([
			"resume",
			"pause",
			"answer",
			"management",
		]);
		expect(page.items[2]?.questionTitle).toBe(`History question ${run}`);
		expect(page.items[3]?.action).toBe("agent.key.create");
	});

	test("filters by group and pages by cursor", async () => {
		const asOwner = clientAs(session(owner));
		const content = await asOwner.agents.activity({
			id: agentId,
			group: "content",
		});
		expect(content.items.map((item) => item.kind)).toEqual(["answer"]);

		const first = await asOwner.agents.activity({ id: agentId, limit: 2 });
		expect(first.items).toHaveLength(2);
		const second = await asOwner.agents.activity({
			id: agentId,
			limit: 2,
			cursor: first.nextCursor ?? undefined,
		});
		expect(second.items.map((item) => item.kind)).toEqual([
			"answer",
			"management",
		]);
		expect(second.nextCursor).toBeNull();
	});

	test("a staff member who may read the audit log reads it too", async () => {
		const page = await clientAs(session(auditor, "admin")).agents.activity({
			id: agentId,
		});
		expect(page.items).toHaveLength(4);
	});

	test("anyone else gets NOT_FOUND, a visitor UNAUTHORIZED", async () => {
		await expect(
			clientAs(session(stranger)).agents.activity({ id: agentId }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			clientAs(null).agents.activity({ id: agentId }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});
