/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import {
	composeText,
	createBlueskyPublisher,
	createMockPublisher,
	MemoryIdempotencyStore,
	publisherFromEnv,
	type SharePost,
} from "./index";

const post: SharePost = {
	text: "Answer accepted: how to X?",
	url: "https://codesphere.dev/questions/1",
	idempotencyKey: "share:question:1:bluesky",
};

describe("composeText", () => {
	test("puts the link on its own line", () => {
		expect(composeText(post)).toBe(`${post.text}\n${post.url}`);
	});
	test("shortens the text, never the link", () => {
		const out = composeText({ ...post, text: "word ".repeat(200) });
		expect(out.length).toBeLessThanOrEqual(300);
		expect(out.endsWith(post.url)).toBe(true);
		expect(out).toContain("…\n");
	});
});

describe("mock publisher", () => {
	test("reports a published post", async () => {
		const { publisher } = createMockPublisher();
		const [report] = await publisher.publish(post);
		expect(report?.state).toBe("published");
	});

	test("the same key publishes once", async () => {
		const { publisher, history } = createMockPublisher({
			idempotencyStore: new MemoryIdempotencyStore(),
		});
		await publisher.publish(post);
		const before = history().length;
		await publisher.publish(post);
		expect(history().length).toBe(before);
	});

	test("a rate limit is a retryable failure", async () => {
		const { publisher } = createMockPublisher({ scenario: "rate-limited" });
		const [report] = await publisher.publish(post);
		expect(report?.state).toBe("failed");
		expect(report?.retryable).toBe(true);
	});

	test("an expired permission is a failure that needs a human", async () => {
		const { publisher } = createMockPublisher({
			scenario: "expired-permission",
		});
		const [report] = await publisher.publish(post);
		expect(report?.state).not.toBe("published");
	});
});

describe("bluesky publisher", () => {
	function fakeBluesky() {
		const calls: { url: string; body: unknown; auth: string | null }[] = [];
		const fetch = (async (
			input: string | URL | Request,
			init?: RequestInit,
		) => {
			const url = String(input);
			const headers = new Headers(init?.headers);
			const body = init?.body ? JSON.parse(String(init.body)) : undefined;
			calls.push({ url, body, auth: headers.get("authorization") });
			if (url.endsWith("com.atproto.server.createSession")) {
				return Response.json({ did: "did:plc:abc", accessJwt: "jwt-1" });
			}
			if (url.endsWith("com.atproto.repo.createRecord")) {
				return Response.json({
					uri: "at://did:plc:abc/app.bsky.feed.post/3k",
					cid: "bafy",
				});
			}
			return Response.json({}, { status: 404 });
		}) as typeof globalThis.fetch;
		return { calls, fetch };
	}

	test("signs in, then creates one post record with the bearer token", async () => {
		const { calls, fetch } = fakeBluesky();
		const publisher = createBlueskyPublisher({
			service: "https://bsky.test",
			identifier: "codesphere.test",
			appPassword: "app-pass",
			fetch,
		});
		const [report] = await publisher.publish(post);
		const records = calls.filter((c) => c.url.endsWith("createRecord"));
		expect(records).toHaveLength(1);
		expect(records[0]?.auth).toBe("Bearer jwt-1");
		expect(JSON.stringify(records[0]?.body)).toContain(post.url);
		expect(report?.state).toBe("published");
	});

	test("a failed sign-in throws without leaking the password", async () => {
		const publisher = createBlueskyPublisher({
			service: "https://bsky.test",
			identifier: "x",
			appPassword: "super-secret",
			fetch: (async () =>
				new Response("no", { status: 401 })) as unknown as typeof fetch,
		});
		const error = await publisher.publish(post).catch((e: Error) => e);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).not.toContain("super-secret");
	});
});

describe("publisherFromEnv", () => {
	test("is off without credentials", () => {
		expect(publisherFromEnv({})).toBeNull();
		expect(publisherFromEnv({ BLUESKY_IDENTIFIER: "a" })).toBeNull();
	});
	test("is on with an identifier and an app password", () => {
		const p = publisherFromEnv({
			BLUESKY_IDENTIFIER: "a",
			BLUESKY_APP_PASSWORD: "b",
		});
		expect(p?.platforms).toEqual(["bluesky"]);
	});
});
