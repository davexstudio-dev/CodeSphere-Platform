/// <reference types="bun" />
// Integration test of the agents module, the key presets and account deletion through the router,
// against a real Postgres (#52): each procedure's nominal path, its typed errors and its audit event.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import {
	account,
	apikey,
	session as sessions,
	user,
} from "@codesphere/db/schema/auth";
import { answers, questions } from "@codesphere/db/schema/questions";
import { createRouterClient } from "@orpc/server";
import { eq, inArray, like, or } from "drizzle-orm";

import { appRouter } from "../routers";
import { testContext } from "../test-context";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("agents and account deletion on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID();
	const owner = `it-ag-owner-${run}`;
	const other = `it-ag-other-${run}`;
	const leaver = `it-ag-leaver-${run}`;
	const scoper = `it-ag-scoper-${run}`;
	const ids = [owner, other, leaver, scoper];

	const session = (id: string, kind = "human") =>
		({
			user: { id, role: "member", kind },
			session: { id: `s-${id}` },
		}) as unknown as Session;
	const clientAs = (s: Session | null) =>
		createRouterClient(appRouter, {
			context: testContext({ db, session: s }),
		});
	const asOwner = clientAs(session(owner));
	const asOther = clientAs(session(other));
	const asLeaver = clientAs(session(leaver));
	const anonymous = clientAs(null);

	const eventsFor = async (targetId: string) =>
		(await db.select().from(auditLog).where(eq(auditLog.targetId, targetId)))
			.map((e) => e.action)
			.sort();

	beforeAll(async () => {
		await db.insert(user).values(
			ids.map((id) => ({
				id,
				name: id,
				email: `${id}@example.com`,
			})),
		);
	});

	afterAll(async () => {
		const agentRows = await db
			.select({ id: user.id })
			.from(user)
			.where(inArray(user.ownerId, ids));
		const all = [...ids, ...agentRows.map((a) => a.id)];
		await db.delete(auditLog).where(inArray(auditLog.actorId, ids));
		await db.delete(apikey).where(inArray(apikey.referenceId, all));
		await db.delete(account).where(inArray(account.userId, all));
		await db.delete(answers).where(inArray(answers.authorId, all));
		await db.delete(questions).where(inArray(questions.authorId, all));
		await db.delete(user).where(inArray(user.id, all));
		await db
			.delete(auditLog)
			.where(or(like(auditLog.targetId, `it-ag-%${run}`)));
	});

	test("create returns the key once, stores only its hash, and is audited", async () => {
		const { agent, key } = await asOwner.agents.create({
			name: "Helper bot",
			preset: "contribute",
		});
		expect(key).toStartWith("cs_live_");
		expect(agent).toMatchObject({
			name: "Helper bot",
			preset: "contribute",
			enabled: true,
		});
		const [stored] = await db
			.select()
			.from(apikey)
			.where(eq(apikey.referenceId, agent.id));
		expect(stored?.key).not.toBe(key);
		expect(await eventsFor(agent.id)).toEqual(["agent.key.create"]);
		const [row] = await db.select().from(user).where(eq(user.id, agent.id));
		expect(row).toMatchObject({ kind: "agent", ownerId: owner });
	});

	test("the Owner is emailed when a key is created or rotated, never given the key", async () => {
		const sent: { email: string; keyName: string }[] = [];
		const notified = createRouterClient(appRouter, {
			context: testContext({
				db,
				session: session(owner),
				notifications: {
					async apiKeyCreated(member, keyName) {
						sent.push({ email: member.email, keyName });
					},
					async agentPaused() {},
				},
			}),
		});
		const { agent } = await notified.agents.create({
			name: "Mailed",
			preset: "read",
		});
		await notified.agents.rotateKey({ id: agent.id });
		expect(sent).toEqual([
			{ email: `${owner}@example.com`, keyName: "Mailed" },
			{ email: `${owner}@example.com`, keyName: "Mailed" },
		]);
		await notified.agents.delete({ id: agent.id });
	});

	test("an Agent or a visitor cannot manage agents", async () => {
		await expect(anonymous.agents.list()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		await expect(
			clientAs(session(owner, "agent")).agents.list(),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("at most 3 agents per Owner", async () => {
		for (let i = 0; i < 2; i++) {
			await asOther.agents.create({ name: `a${i}`, preset: "read" });
		}
		await asOther.agents.create({ name: "a2", preset: "read" });
		await expect(
			asOther.agents.create({ name: "a3", preset: "read" }),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	test("rotateKey replaces the key and audits the revocation and the new key", async () => {
		const { agent, key } = await asOwner.agents.create({
			name: "Rotating",
			preset: "read",
		});
		const rotated = await asOwner.agents.rotateKey({ id: agent.id });
		expect(rotated.key).not.toBe(key);
		expect(await eventsFor(agent.id)).toEqual([
			"agent.key.create",
			"agent.key.create",
			"agent.key.revoke",
		]);
		await expect(
			asOther.agents.rotateKey({ id: agent.id }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("disable turns the key off, delete retires the agent; both are audited", async () => {
		const { agent } = await asOwner.agents.create({
			name: "Short-lived",
			preset: "read",
		});
		const disabled = await asOwner.agents.disable({ id: agent.id });
		expect(disabled.enabled).toBe(false);
		await expect(
			asOther.agents.disable({ id: agent.id }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });

		await asOwner.agents.delete({ id: agent.id });
		const { items } = await asOwner.agents.list();
		expect(items.map((a) => a.id)).not.toContain(agent.id);
		expect(
			await db.select().from(apikey).where(eq(apikey.referenceId, agent.id)),
		).toHaveLength(0);
		expect(await eventsFor(agent.id)).toEqual([
			"agent.key.create",
			"agent.key.revoke",
			"agent.key.revoke",
		]);
		await expect(asOwner.agents.delete({ id: agent.id })).rejects.toMatchObject(
			{ code: "NOT_FOUND" },
		);
	});

	test("a read-only key refuses writes; a contribute key may ask", async () => {
		const reader = await clientAs(session(scoper)).agents.create({
			name: "r",
			preset: "read",
		});
		const writer = await clientAs(session(scoper)).agents.create({
			name: "w",
			preset: "contribute",
		});
		const input = {
			idempotencyKey: crypto.randomUUID(),
			title: "From an agent",
			body: "hello",
			language: "en" as const,
			tags: ["sql"],
		};
		await expect(
			clientAs(session(reader.agent.id, "agent")).questions.create(input),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			clientAs(session(writer.agent.id, "agent")).questions.create(input),
		).resolves.toMatchObject({ authorId: writer.agent.id });
	});

	test("members.delete anonymises the account, ends linked accounts and audits it", async () => {
		await db.insert(account).values({
			id: `acc-${run}`,
			accountId: "ext",
			providerId: "github",
			userId: leaver,
		});
		await db.insert(sessions).values({
			id: `sess-${run}`,
			token: `tok-${run}`,
			userId: leaver,
			expiresAt: new Date(Date.now() + 60_000),
		});
		const asked = await asLeaver.questions.create({
			idempotencyKey: crypto.randomUUID(),
			title: "Asked before leaving",
			body: "body",
			language: "en",
			tags: ["sql"],
		});
		await asLeaver.members.delete({ deleteContent: false });
		expect(
			await db.select().from(sessions).where(eq(sessions.userId, leaver)),
		).toHaveLength(0);
		// The content stays, shown as written by « Deleted member ».
		const listed = await anonymous.questions.list({
			sort: "recent",
			limit: 50,
		});
		expect(listed.items.find((q) => q.id === asked.id)?.authorName).toBe(
			"Deleted member",
		);
		const [row] = await db.select().from(user).where(eq(user.id, leaver));
		expect(row).toMatchObject({
			name: "Deleted member",
			email: `deleted-${leaver}@deleted.invalid`,
			suspensionReason: "deleted",
		});
		expect(
			await db.select().from(account).where(eq(account.userId, leaver)),
		).toHaveLength(0);
		expect(await eventsFor(leaver)).toEqual(["member.delete"]);
	});

	test("deleteContent removes content except an Answer accepted on someone else's Question", async () => {
		const mine = `it-ag-del-${run}`;
		await db
			.insert(user)
			.values({ id: mine, name: mine, email: `${mine}@example.com` });
		const seed = (authorId: string) =>
			db
				.insert(questions)
				.values({
					authorId,
					idempotencyKey: crypto.randomUUID(),
					title: "t",
					body: "b",
					bodyHtml: "<p>b</p>",
					language: "en",
					tags: ["sql"],
				})
				.returning();
		const [own] = await seed(mine);
		const [theirs] = await seed(owner);
		const reply = async (questionId: string) => {
			const [row] = await db
				.insert(answers)
				.values({
					questionId,
					authorId: mine,
					idempotencyKey: crypto.randomUUID(),
					body: "a",
					bodyHtml: "<p>a</p>",
				})
				.returning();
			return row;
		};
		const kept = await reply(theirs?.id as string);
		const gone = await reply(own?.id as string);
		await db
			.update(questions)
			.set({ acceptedAnswerId: kept?.id })
			.where(eq(questions.id, theirs?.id as string));

		await clientAs(session(mine)).members.delete({ deleteContent: true });

		const [q] = await db
			.select()
			.from(questions)
			.where(eq(questions.id, own?.id as string));
		const [k] = await db
			.select()
			.from(answers)
			.where(eq(answers.id, kept?.id as string));
		const [g] = await db
			.select()
			.from(answers)
			.where(eq(answers.id, gone?.id as string));
		expect(q?.deletedAt).not.toBeNull();
		expect(g?.deletedAt).not.toBeNull();
		expect(k?.deletedAt).toBeNull();
		await db.delete(auditLog).where(eq(auditLog.actorId, mine));
		await db.delete(answers).where(eq(answers.authorId, mine));
		await db.delete(questions).where(eq(questions.authorId, mine));
		await db.delete(user).where(eq(user.id, mine));
	});

	test("an Agent cannot delete an account; a visitor is UNAUTHORIZED", async () => {
		await expect(
			clientAs(session(owner, "agent")).members.delete({
				deleteContent: false,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			anonymous.members.delete({ deleteContent: false }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});
