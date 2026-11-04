/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { createWriteQuota, memoryLimiters, WRITE_QUOTAS } from "./write-quota";

describe("createWriteQuota", () => {
	test("takes an Agent's Owner from the session without reading the database", async () => {
		let reads = 0;
		const quota = createWriteQuota(memoryLimiters, async () => {
			reads++;
			return "owner-from-db";
		});
		await quota.consume(
			{ id: "bot", kind: "agent", ownerId: "owner-1" },
			"answer",
		);
		expect(reads).toBe(0);
		await quota.consume({ id: "bot", kind: "agent" }, "answer");
		expect(reads).toBe(1);
	});

	test("an Agent over its own daily quota is refused, a human is not held to it", async () => {
		const quota = createWriteQuota(memoryLimiters, async () => null);
		const { maxRequests } = WRITE_QUOTAS.agent.question;
		for (let i = 0; i < maxRequests; i++) {
			await quota.consume({ id: "bot-1", kind: "agent" }, "question");
		}
		await expect(
			quota.consume({ id: "bot-1", kind: "agent" }, "question"),
		).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
		// Same id as a human is a different quota: the hourly one.
		await expect(
			quota.consume({ id: "bot-1", kind: "human" }, "question"),
		).resolves.toBeUndefined();
	});
});
