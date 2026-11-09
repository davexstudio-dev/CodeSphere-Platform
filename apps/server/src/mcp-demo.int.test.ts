/// <reference types="bun" />
// The CADEV demo's agent step (docs/cadev/demo-script.md, #57) over /mcp with the real better-auth
// key check: the tools the script names are listed under the names it cites, an Agent with the
// « Contribuer » preset answers a Question through `answers_create` with `Authorization: Bearer`
// (as MCP clients send it), its Answer is folded until a human other than its Owner votes it up,
// and a « Lecture seule » key is refused the same call.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { appRouter } from "@codesphere/api/routers/index";
import { testContext } from "@codesphere/api/test-context";
import type { Session } from "@codesphere/auth";
import { createAuth } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { apikey, user } from "@codesphere/db/schema/auth";
import { answers, questions, votes } from "@codesphere/db/schema/questions";
import { createLogger } from "@codesphere/logger";
import { createRouterClient } from "@orpc/server";
import { eq, inArray } from "drizzle-orm";

import { createApp } from "./app";

const url = process.env.TEST_DATABASE_URL;

type ToolResult = {
	result?: {
		isError?: boolean;
		content?: { type: string; text: string }[];
		structuredContent?: unknown;
		tools?: { name: string }[];
	};
	error?: { code: number; message: string };
};

describe.skipIf(!url)("the demo agent over /mcp on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID();
	const owner = `it-mcp-owner-${run}`;
	const asker = `it-mcp-asker-${run}`;
	const voter = `it-mcp-voter-${run}`;
	const origin = "http://localhost:3000";
	const auth = createAuth(
		{
			BETTER_AUTH_URL: origin,
			BETTER_AUTH_SECRET: "s".repeat(32),
			CORS_ORIGIN: origin,
		} as never,
		db,
	);
	const app = createApp({
		auth,
		db,
		logger: createLogger({ level: "silent" }),
		corsOrigin: origin,
		trustProxy: false,
		release: { version: "test", commit: "test" },
		apiDocs: false,
	});
	const as = (id: string) =>
		createRouterClient(appRouter, {
			context: testContext({
				db,
				session: {
					user: { id, role: "member", kind: "human" },
					session: { id: `s-${id}` },
				} as unknown as Session,
			}),
		});

	const mcp = async (
		key: string,
		method: string,
		params: object = {},
	): Promise<ToolResult> => {
		const response = await app.request("/mcp", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				authorization: `Bearer ${key}`,
			},
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
		});
		return (await response.json()) as ToolResult;
	};
	const callTool = (key: string, name: string, args: object) =>
		mcp(key, "tools/call", { name, arguments: args });

	let questionId = "";
	let contributeKey = "";
	let readKey = "";

	beforeAll(async () => {
		await db.insert(user).values(
			[owner, asker, voter].map((id) => ({
				id,
				name: id,
				email: `${id}@example.com`,
			})),
		);
		const question = await as(asker).questions.create({
			idempotencyKey: crypto.randomUUID(),
			title: `Comment recevoir un callback mobile money ? ${run}`,
			body: "Le fournisseur appelle mon URL, comment vérifier la signature ?",
			language: "fr",
			tags: ["mobile-money"],
		});
		questionId = question.id;
		contributeKey = (
			await as(owner).agents.create({
				name: "Assistant Mobile Money",
				preset: "contribute",
			})
		).key;
		readKey = (
			await as(owner).agents.create({ name: "Lecteur", preset: "read" })
		).key;
	}, 30_000);

	afterAll(async () => {
		const agents = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.ownerId, owner));
		const everyone = [owner, asker, voter, ...agents.map((a) => a.id)];
		const rows = await db
			.select({ id: questions.id })
			.from(questions)
			.where(inArray(questions.authorId, everyone));
		const questionIds = rows.map((q) => q.id);
		if (questionIds.length > 0) {
			const theirs = await db
				.select({ id: answers.id })
				.from(answers)
				.where(inArray(answers.questionId, questionIds));
			const answerIds = theirs.map((a) => a.id);
			await db.delete(votes).where(inArray(votes.userId, everyone));
			if (answerIds.length > 0) {
				await db.delete(answers).where(inArray(answers.id, answerIds));
			}
			await db.delete(questions).where(inArray(questions.id, questionIds));
		}
		await db.delete(auditLog).where(inArray(auditLog.actorId, everyone));
		await db.delete(apikey).where(inArray(apikey.referenceId, everyone));
		await db.delete(user).where(
			inArray(
				user.id,
				agents.map((a) => a.id),
			),
		);
		await db.delete(user).where(inArray(user.id, [owner, asker, voter]));
	}, 30_000);

	test("tools/list shows the three tools the demo script names", async () => {
		const res = await mcp(contributeKey, "tools/list");
		const names = res.result?.tools?.map((t) => t.name) ?? [];
		expect(names).toContain("questions_list");
		expect(names).toContain("questions_get");
		expect(names).toContain("answers_create");
	});

	test("the agent reads the Question by its Tag, then answers it", async () => {
		const listed = await callTool(contributeKey, "questions_list", {
			tags: ["mobile-money"],
		});
		expect(listed.result?.isError).not.toBe(true);
		expect(JSON.stringify(listed.result)).toContain(questionId);

		const fetched = await callTool(contributeKey, "questions_get", {
			id: questionId,
		});
		expect(fetched.result?.isError).not.toBe(true);
		expect(JSON.stringify(fetched.result)).toContain("callback mobile money");

		const created = await callTool(contributeKey, "answers_create", {
			idempotencyKey: crypto.randomUUID(),
			questionId,
			body: "Calculez le HMAC-SHA256 du corps brut avec votre secret et comparez en temps constant.",
		});
		expect(created.result?.isError).not.toBe(true);
		expect(JSON.stringify(created.result)).toContain("HMAC-SHA256");
	}, 30_000);

	test("the agent's Answer is folded until a human other than its Owner votes it up", async () => {
		const folded = await as(asker).answers.list({ questionId });
		expect(folded.items).toHaveLength(1);
		expect(folded.items[0]?.collapsed).toBe(true);
		expect(folded.items[0]?.authorKind).toBe("agent");

		// The Owner vouching for their own agent proves nothing.
		await as(owner).votes.cast({
			targetType: "answer",
			targetId: folded.items[0]?.id ?? "",
			value: "up",
		});
		expect(
			(await as(asker).answers.list({ questionId })).items[0]?.collapsed,
		).toBe(true);

		await as(voter).votes.cast({
			targetType: "answer",
			targetId: folded.items[0]?.id ?? "",
			value: "up",
		});
		expect(
			(await as(asker).answers.list({ questionId })).items[0]?.collapsed,
		).toBe(false);
	}, 30_000);

	test("a second Answer from the same agent is a refused as a Conflict, not a crash", async () => {
		const again = await callTool(contributeKey, "answers_create", {
			idempotencyKey: crypto.randomUUID(),
			questionId,
			body: "Une seconde réponse.",
		});
		expect(again.result?.isError).toBe(true);
		expect(JSON.stringify(again.result)).toContain("Conflict");
	}, 30_000);

	test("a read-only key is refused answers_create (read-only)", async () => {
		const refused = await callTool(readKey, "answers_create", {
			idempotencyKey: crypto.randomUUID(),
			questionId,
			body: "Je ne devrais pas pouvoir écrire.",
		});
		expect(refused.result?.isError).toBe(true);
		expect(JSON.stringify(refused.result)).toContain("read-only");
	}, 30_000);

	test("no key at all: the write is Unauthorized", async () => {
		const response = await app.request("/mcp", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "answers_create",
					arguments: {
						idempotencyKey: crypto.randomUUID(),
						questionId,
						body: "Anonyme",
					},
				},
			}),
		});
		const res = (await response.json()) as ToolResult;
		expect(res.result?.isError).toBe(true);
		expect(JSON.stringify(res.result)).toContain("Unauthorized");
	});
});
