/// <reference types="bun" />
// Integration test against a real Postgres (#265); skipped without TEST_DATABASE_URL.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { user } from "@codesphere/db/schema/auth";
import { socialPost } from "@codesphere/db/schema/social";
import { eq, inArray } from "drizzle-orm";

import { createSocialPostStore, shareKey } from "./admin-social";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("social_post store on Postgres (#265)", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const store = createSocialPostStore(db);
	const run = crypto.randomUUID().slice(0, 8);
	const actorId = `it-social-${run}`;
	const input = {
		type: "hackathon",
		id: `it-${run}`,
		platform: "bluesky",
	} as const;
	const key = shareKey(input);

	beforeAll(async () => {
		await db.insert(user).values({
			id: actorId,
			name: "Social admin",
			email: `${actorId}@example.test`,
			emailVerified: true,
			role: "admin",
		});
	});

	afterAll(async () => {
		await db.delete(socialPost).where(eq(socialPost.idempotencyKey, key));
		await db.delete(auditLog).where(eq(auditLog.actorId, actorId));
		await db.delete(user).where(inArray(user.id, [actorId]));
	});

	test("the first claim wins, the second loses, and the claim is audited", async () => {
		expect(await store.claim({ key, actorId, text: "Hello", input })).toBe(
			true,
		);
		expect(await store.claim({ key, actorId, text: "Hello", input })).toBe(
			false,
		);
		const audit = await db
			.select()
			.from(auditLog)
			.where(eq(auditLog.actorId, actorId));
		expect(audit.map((a) => a.action)).toEqual(["social.publish"]);
	});

	test("only a retryable failure can be reclaimed", async () => {
		expect(await store.reclaim(key, actorId)).toBe(false); // still pending
		await store.finish(key, {
			state: "failed",
			postUrl: null,
			message: "x",
			retryable: false,
		});
		expect(await store.reclaim(key, actorId)).toBe(false);
		await store.finish(key, {
			state: "failed",
			postUrl: null,
			message: "x",
			retryable: true,
		});
		expect(await store.reclaim(key, actorId)).toBe(true);
		expect((await store.find(key))?.state).toBe("pending");
	});
});
