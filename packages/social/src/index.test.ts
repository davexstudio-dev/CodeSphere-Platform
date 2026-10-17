/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import {
	composeText,
	createBlueskyPublisher,
	createMockPublisher,
	createPublisher,
	MemoryIdempotencyStore,
	publisherFromEnv,
	type SharePost,
	xWeight,
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
		const out = composeText({ ...post, text: "word ".repeat(200) }, "bluesky");
		expect(out.length).toBeLessThanOrEqual(300);
		expect(out.endsWith(post.url)).toBe(true);
		expect(out).toContain("…\n");
	});
});

describe("composeText per platform", () => {
	const long = { ...post, text: "mot ".repeat(400) };
	test("X: text plus a 23-character link fits 280", () => {
		const out = composeText(long, "x");
		const [body] = out.split("\n");
		expect(xWeight(body ?? "") + 1 + 23).toBeLessThanOrEqual(280);
		expect(out.endsWith(post.url)).toBe(true);
	});
	test("X: a long link still counts 23", () => {
		const url = `https://codesphere.dev/questions/${"a".repeat(200)}`;
		const out = composeText({ ...post, url, text: "ok" }, "x");
		expect(out).toBe(`ok\n${url}`);
	});
	test("X: emoji and non-Latin text weigh double", () => {
		expect(xWeight("abc")).toBe(3);
		expect(xWeight("😀")).toBe(2);
		expect(xWeight("日本")).toBe(4);
		const out = composeText({ ...post, text: "日".repeat(300) }, "x");
		expect(xWeight(out.split("\n")[0] ?? "")).toBeLessThanOrEqual(256);
	});
	test("LinkedIn keeps up to 3000 characters", () => {
		const out = composeText({ ...post, text: "x".repeat(2900) }, "linkedin");
		expect(out.length).toBe(2900 + 1 + post.url.length);
		expect(composeText(long, "linkedin").length).toBeLessThanOrEqual(3000);
	});
});

describe("mock publisher", () => {
	test("reports a published post", async () => {
		const { publisher } = createMockPublisher();
		const [report] = await publisher.publish(post, "bluesky");
		expect(report?.state).toBe("published");
	});

	test("answers for every platform", async () => {
		const { publisher } = createMockPublisher();
		expect(publisher.platforms).toEqual(["bluesky", "linkedin", "x"]);
		for (const platform of publisher.platforms) {
			const [report] = await publisher.publish(
				{ ...post, idempotencyKey: `k-${platform}` },
				platform,
			);
			expect(report?.state).toBe("published");
		}
	});

	test("the same key publishes once", async () => {
		const { publisher, history } = createMockPublisher({
			idempotencyStore: new MemoryIdempotencyStore(),
		});
		await publisher.publish(post, "bluesky");
		const before = history().length;
		await publisher.publish(post, "bluesky");
		expect(history().length).toBe(before);
	});

	test("a rate limit is a retryable failure", async () => {
		const { publisher } = createMockPublisher({ scenario: "rate-limited" });
		const [report] = await publisher.publish(post, "bluesky");
		expect(report?.state).toBe("failed");
		expect(report?.retryable).toBe(true);
	});

	test("an expired permission is a failure that needs a human", async () => {
		const { publisher } = createMockPublisher({
			scenario: "expired-permission",
		});
		const [report] = await publisher.publish(post, "bluesky");
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
		const [report] = await publisher.publish(post, "bluesky");
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
		const error = await publisher
			.publish(post, "bluesky")
			.catch((e: Error) => e);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).not.toContain("super-secret");
	});
});

describe("linkedin and x adapters", () => {
	function recorder(respond: (url: string) => Response) {
		const calls: {
			url: string;
			method: string;
			auth: string | null;
			body: string;
		}[] = [];
		const fetch = (async (
			input: string | URL | Request,
			init?: RequestInit,
		) => {
			const url = String(input);
			calls.push({
				url,
				method: init?.method ?? "GET",
				auth: new Headers(init?.headers).get("authorization"),
				body: init?.body ? String(init.body) : "",
			});
			return respond(url);
		}) as unknown as typeof globalThis.fetch;
		return { calls, fetch };
	}

	test("X posts one tweet with the bearer token", async () => {
		const { calls, fetch } = recorder((url) =>
			url.includes("/2/tweets")
				? Response.json({ data: { id: "111", text: "t" } })
				: Response.json({}, { status: 404 }),
		);
		const publisher = createPublisher({
			x: { userId: "42", accessToken: "x-token", fetch },
		});
		const reports = await publisher.publish(post, "x");
		const tweets = calls.filter(
			(c) => c.method === "POST" && c.url.endsWith("/2/tweets"),
		);
		expect(tweets).toHaveLength(1);
		expect(tweets[0]?.auth).toBe("Bearer x-token");
		expect(tweets[0]?.body).toContain(post.url);
		expect(reports[0]?.platform).toBe("x");
		expect(reports[0]?.state).toBe("published");
	});

	test("LinkedIn posts once as the configured author", async () => {
		const { calls, fetch } = recorder((url) =>
			url.includes("/rest/posts")
				? new Response(null, {
						status: 201,
						headers: { "x-restli-id": "urn:li:share:7" },
					})
				: Response.json({}, { status: 404 }),
		);
		const publisher = createPublisher({
			linkedin: {
				accessToken: "li-token",
				author: "urn:li:organization:99",
				apiVersion: "202609",
				fetch,
			},
		});
		const reports = await publisher.publish(post, "linkedin");
		const posts = calls.filter(
			(c) => c.method === "POST" && c.url.includes("/rest/posts"),
		);
		expect(posts).toHaveLength(1);
		expect(posts[0]?.auth).toBe("Bearer li-token");
		expect(posts[0]?.body).toContain("urn:li:organization:99");
		expect(posts[0]?.body).toContain(post.url);
		expect(reports[0]?.platform).toBe("linkedin");
	});

	test("an expired token is a failure, not a published post", async () => {
		const { fetch } = recorder(() =>
			Response.json({ message: "expired" }, { status: 401 }),
		);
		const publisher = createPublisher({
			x: { userId: "42", accessToken: "old", fetch },
		});
		const [report] = await publisher.publish(post, "x");
		expect(report?.state).not.toBe("published");
	});

	test("a refused token is flagged as an auth failure, never published", async () => {
		const { fetch } = recorder(() =>
			Response.json({ message: "expired" }, { status: 401 }),
		);
		const publisher = createPublisher({
			x: {
				credentials: async () => ({ accessToken: "revoked", accountId: "42" }),
				fetch,
			},
		});
		const [report] = await publisher.publish(post, "x");
		expect(report?.state).toBe("failed");
		expect(report?.authFailure).toBe(true);
	});

	test("an ordinary failure is not flagged as an auth failure", async () => {
		const { fetch } = recorder(() => Response.json({}, { status: 500 }));
		const publisher = createPublisher({
			x: { userId: "42", accessToken: "t", fetch },
		});
		const [report] = await publisher.publish(post, "x");
		expect(report?.state).not.toBe("published");
		expect(report?.authFailure).not.toBe(true);
	});

	test("a malformed LinkedIn author is refused at configuration", () => {
		expect(() =>
			createPublisher({
				linkedin: { accessToken: "t", author: "someone", apiVersion: "202609" },
			}),
		).toThrow();
	});

	test("publishing to a platform without credentials throws", async () => {
		const publisher = createPublisher({
			x: { userId: "1", accessToken: "t" },
		});
		await expect(publisher.publish(post, "linkedin")).rejects.toThrow();
	});
});

describe("publisherFromEnv", () => {
	test("is off without credentials", () => {
		expect(publisherFromEnv({})).toBeNull();
		expect(publisherFromEnv({ BLUESKY_IDENTIFIER: "a" })).toBeNull();
	});
	test("a platform with only some of its variables is left out", () => {
		expect(publisherFromEnv({ X_USER_ID: "1" })).toBeNull();
		expect(publisherFromEnv({ LINKEDIN_ACCESS_TOKEN: "t" })).toBeNull();
	});
	test("lists every fully configured platform", () => {
		const p = publisherFromEnv({
			BLUESKY_IDENTIFIER: "a",
			BLUESKY_APP_PASSWORD: "b",
			LINKEDIN_ACCESS_TOKEN: "t",
			LINKEDIN_AUTHOR: "urn:li:person:1",
			X_USER_ID: "1",
			X_ACCESS_TOKEN: "t",
		});
		expect(p?.platforms).toEqual(["bluesky", "linkedin", "x"]);
	});
	test("is on with an identifier and an app password", () => {
		const p = publisherFromEnv({
			BLUESKY_IDENTIFIER: "a",
			BLUESKY_APP_PASSWORD: "b",
		});
		expect(p?.platforms).toEqual(["bluesky"]);
	});
});
