/// <reference types="bun" />
// Integration test against a real Postgres (#265); skipped without TEST_DATABASE_URL.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { user } from "@codesphere/db/schema/auth";
import { outboxEvents } from "@codesphere/db/schema/outbox";
import { socialPost } from "@codesphere/db/schema/social";
import { createMockPublisher } from "@codesphere/social";
import { and, eq, inArray, sql } from "drizzle-orm";

import {
	createSocialPostStore,
	recentPosts,
	SOCIAL_PUBLISH_REQUESTED,
	sendShare,
	shareKey,
} from "./admin-social";

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
		await db
			.delete(outboxEvents)
			.where(sql`${outboxEvents.payload}->>'key' = ${key}`);
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

	test("each claim writes one event, in the same statement", async () => {
		const events = await db
			.select()
			.from(outboxEvents)
			.where(
				and(
					eq(outboxEvents.type, SOCIAL_PUBLISH_REQUESTED),
					sql`${outboxEvents.payload}->>'key' = ${key}`,
				),
			);
		// The claim and the reclaim above; the claim that lost wrote nothing.
		expect(events).toHaveLength(2);
	});

	test("the consumer sends once, however many deliveries", async () => {
		const deps = {
			store,
			publisher: createMockPublisher().publisher,
			siteUrl: "https://codesphere.test",
			loadTarget: async () =>
				({ ok: true, title: "T", path: "/hackathons/x" }) as const,
		};
		const first = await sendShare(deps, key);
		expect(first?.state).toBe("published");
		expect(await sendShare(deps, key)).toBeNull();
	});

	test("a post left behind is settled: never sent is retryable, mid-send is unknown", async () => {
		const age = sql`now() - interval '1 hour'`;
		await db
			.update(socialPost)
			.set({ state: "pending", updatedAt: age })
			.where(eq(socialPost.idempotencyKey, key));
		await recentPosts(db);
		expect(await store.find(key)).toMatchObject({
			state: "failed",
			retryable: true,
		});
		await db
			.update(socialPost)
			.set({ state: "sending", retryable: false, updatedAt: age })
			.where(eq(socialPost.idempotencyKey, key));
		const posts = await recentPosts(db);
		expect(posts.find((post) => post.id === input.id)?.state).toBe("unknown");
		expect(await store.reclaim(key, actorId)).toBe(false);
	});
});
