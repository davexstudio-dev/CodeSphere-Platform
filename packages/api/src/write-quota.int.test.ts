/// <reference types="bun" />
// The shared write limits: counters in Postgres, quotas per Agent and per Owner (#246).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { apikey, user } from "@codesphere/db/schema/auth";
import { questions } from "@codesphere/db/schema/questions";
import { rateLimits } from "@codesphere/db/schema/rate-limit";
import { createRouterClient } from "@orpc/server";
import { inArray, like } from "drizzle-orm";

import { postgresLimiters } from "./pg-rate-limiter";
import { appRouter } from "./routers";
import { testContext } from "./test-context";
import { postgresWriteQuota, WRITE_QUOTAS } from "./write-quota";

const url = process.env.TEST_DATABASE_URL;
const HOUR = 3_600_000;

describe.skipIf(!url)("shared write limits on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID();
	const owner = `it-rl-owner-${run}`;
	// Created through the API in beforeAll: an Agent can write only with a "contribute" key.
	let agentA = "";
	let agentB = "";
	let agentC = "";
	const ids: string[] = [owner];
	const quota = postgresWriteQuota(db);

	const clientAs = (id: string, kind: "human" | "agent") =>
		createRouterClient(appRouter, {
			context: testContext({
				db,
				writeQuota: quota,
				session: {
					user: { id, role: "member", kind },
					session: { id: `s-${id}` },
				} as unknown as Session,
			}),
		});
	const ask = (id: string, kind: "human" | "agent") =>
		clientAs(id, kind).questions.create({
			idempotencyKey: crypto.randomUUID(),
			title: "How do I index a column?",
			body: "Details of the problem.",
			language: "en",
			tags: ["sql"],
		});

	beforeAll(async () => {
		await db
			.insert(user)
			.values({ id: owner, name: owner, email: `${owner}@example.com` });
		const create = async (name: string) =>
			(
				await clientAs(owner, "human").agents.create({
					name,
					preset: "contribute",
				})
			).agent.id;
		[agentA, agentB, agentC] = [
			await create("a"),
			await create("b"),
			await create("c"),
		];
		ids.push(agentA, agentB, agentC);
	});

	afterAll(async () => {
		await db.delete(questions).where(inArray(questions.authorId, ids));
		await db.delete(rateLimits).where(like(rateLimits.key, `%${run}%`));
		await db.delete(auditLog).where(inArray(auditLog.actorId, ids));
		await db.delete(apikey).where(inArray(apikey.referenceId, ids));
		await db.delete(user).where(inArray(user.id, ids.slice(1)));
		await db.delete(user).where(inArray(user.id, [owner]));
	});

	describe("the Postgres limiter", () => {
		const options = { name: `t-${run}`, maxRequests: 3, windowMs: HOUR };

		test("is shared by every instance and survives a restart", async () => {
			const first = postgresLimiters(db)(options);
			const secondInstance = postgresLimiters(db)(options); // another process, same database
			const key = `shared-${run}`;
			expect((await first.limit(key)).success).toBe(true);
			expect((await secondInstance.limit(key)).success).toBe(true);
			// A "restart": limiters rebuilt from scratch still see the two hits.
			const restarted = postgresLimiters(db)(options);
			expect((await restarted.limit(key)).success).toBe(true);
			expect((await restarted.limit(key)).success).toBe(false);
		});

		test("counts concurrent hits exactly", async () => {
			const limiter = postgresLimiters(db)({ ...options, maxRequests: 10 });
			const key = `burst-${run}`;
			const results = await Promise.all(
				Array.from({ length: 40 }, () => limiter.limit(key)),
			);
			expect(results.filter((r) => r.success)).toHaveLength(10);
		});

		test("a client hammering a closed door does not grow the counter", async () => {
			const limiter = postgresLimiters(db)({ ...options, maxRequests: 3 });
			const key = `hammer-${run}`;
			for (let i = 0; i < 25; i++) {
				await limiter.limit(key);
			}
			const [row] = await db
				.select()
				.from(rateLimits)
				.where(like(rateLimits.key, `%:${key}`));
			expect(row?.hits).toBe(4);
		});

		test("a new window starts from zero and reports when it resets", async () => {
			let clock = Date.UTC(2026, 9, 19, 10, 30);
			const limiter = postgresLimiters(
				db,
				() => clock,
			)({
				...options,
				maxRequests: 1,
			});
			const key = `window-${run}`;
			const first = await limiter.limit(key);
			expect(first.success).toBe(true);
			expect(first.reset).toBe(Date.UTC(2026, 9, 19, 11, 0));
			expect((await limiter.limit(key)).success).toBe(false);
			clock = Date.UTC(2026, 9, 19, 11, 0);
			expect((await limiter.limit(key)).success).toBe(true);
		});

		test("purges the windows that have ended", async () => {
			const key = `purge-${run}`;
			const old = postgresLimiters(
				db,
				() => 1_000_000,
				() => 1,
			)({
				...options,
				name: `purge-${run}`,
			});
			await old.limit(key);
			const now = Date.now();
			await postgresLimiters(
				db,
				() => now,
				() => 0,
			)({
				...options,
				name: `purge-${run}`,
			}).limit("other"); // random() = 0 < odds: purges
			const left = await db
				.select()
				.from(rateLimits)
				.where(like(rateLimits.key, `purge-${run}:%`));
			expect(left.map((r) => r.key)).toEqual([`purge-${run}:other`]);
		});
	});

	describe("write quotas", () => {
		test("an Agent is held to 5 Questions a day, with a retry delay", async () => {
			for (let i = 0; i < WRITE_QUOTAS.agent.question.maxRequests; i++) {
				await ask(agentA, "agent");
			}
			const error = await ask(agentA, "agent").catch(
				(caught: unknown) => caught,
			);
			const refusal = error as { code: string; data: { retryAfter: number } };
			expect(refusal.code).toBe("TOO_MANY_REQUESTS");
			// Seconds until the daily window resets: positive, at most a day.
			expect(typeof refusal.data.retryAfter).toBe("number");
			expect(refusal.data.retryAfter > 0).toBe(true);
			expect(refusal.data.retryAfter <= 86_400).toBe(true);
		});

		test("the Agents of one Owner share a further daily quota", async () => {
			// Agent A used 5 above; B uses its 5: the Owner is now at 10.
			for (let i = 0; i < WRITE_QUOTAS.agent.question.maxRequests; i++) {
				await ask(agentB, "agent");
			}
			// C has asked nothing, yet the Owner's quota is spent.
			await expect(ask(agentC, "agent")).rejects.toMatchObject({
				code: "TOO_MANY_REQUESTS",
			});
		});

		test("Agents' writes do not use up their Owner's own hourly limit", async () => {
			await expect(ask(owner, "human")).resolves.toBeDefined();
		});
	});
});
