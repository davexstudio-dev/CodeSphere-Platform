/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { SocialError } from "@opencoredev/social-sdk";
import {
	MemoryCredentialLock,
	MemoryCredentialStore,
	type StoredCredential,
} from "@opencoredev/social-sdk/server";

import { type CredentialPort, createCredentialSource } from "./credentials";
import { SocialAuthError } from "./errors";
import { createPublisher, type SharePost } from "./index";

const NOW = Date.parse("2026-10-18T12:00:00Z");
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const HOUR = 3_600_000;

const credential = (
	overrides: Partial<StoredCredential> = {},
): StoredCredential => ({
	accessToken: "access-1",
	refreshToken: "refresh-1",
	expiresAt: iso(-60_000), // already expired
	metadata: { accountId: "42", accountName: "CodeSphere" },
	...overrides,
});

async function seeded(value: StoredCredential) {
	const store = new MemoryCredentialStore();
	await store.compareAndSet({
		key: "x",
		expectedRevision: undefined,
		value,
	});
	return store;
}

/** A store that records what is written, in order, next to what else happens. */
function spied(store: MemoryCredentialStore, events: string[]): CredentialPort {
	return {
		get: (key) => store.get(key),
		delete: (key) => store.delete(key),
		async compareAndSet(input) {
			const result = await store.compareAndSet(input);
			if (result.updated) {
				events.push(`saved:${input.value.accessToken}`);
			}
			return result;
		},
	};
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** X-like: the refresh token is single-use, a new one comes with every new access token. */
function rotatingProvider() {
	const spent = new Set<string>();
	let issued = 1;
	const calls: string[] = [];
	return {
		calls,
		async refresh(current: StoredCredential): Promise<StoredCredential> {
			const used = current.refreshToken ?? "";
			calls.push(used);
			await sleep(25);
			if (spent.has(used)) {
				throw new SocialError({
					code: "reconnect_required",
					operation: "oauth.refresh",
					message: "spent",
				});
			}
			spent.add(used);
			issued += 1;
			return {
				...current,
				accessToken: `access-${issued}`,
				refreshToken: `refresh-${issued}`,
				expiresAt: iso(2 * HOUR),
			};
		},
	};
}

function sourceOf(
	store: CredentialPort,
	refresh: (c: StoredCredential) => Promise<StoredCredential>,
	extra: Partial<Parameters<typeof createCredentialSource>[0]> = {},
) {
	return createCredentialSource({
		key: "x",
		store,
		lock: new MemoryCredentialLock(),
		refresh,
		now: () => NOW,
		pollMs: 5,
		...extra,
	});
}

describe("a credential that is still valid", () => {
	test("is used as it is, without any exchange", async () => {
		const store = await seeded(credential({ expiresAt: iso(HOUR) }));
		const provider = rotatingProvider();
		const got = await sourceOf(store, provider.refresh)();
		expect(got).toEqual({ accessToken: "access-1", accountId: "42" });
		expect(provider.calls).toEqual([]);
	});

	test("one with no known expiry is used as it is", async () => {
		const { expiresAt: _unused, ...noExpiry } = credential();
		const store = await seeded(noExpiry);
		const provider = rotatingProvider();
		await sourceOf(store, provider.refresh)();
		expect(provider.calls).toEqual([]);
	});

	test("one that expires within the window is renewed ahead of time", async () => {
		const store = await seeded(credential({ expiresAt: iso(2 * 60_000) }));
		const provider = rotatingProvider();
		const got = await sourceOf(store, provider.refresh)();
		expect(got.accessToken).toBe("access-2");
	});
});

describe("renewing an expired credential", () => {
	test("exchanges once, saves the new tokens, and returns the new one", async () => {
		const store = await seeded(credential());
		const provider = rotatingProvider();
		const got = await sourceOf(store, provider.refresh)();
		expect(got).toEqual({ accessToken: "access-2", accountId: "42" });
		const saved = (await store.get("x"))?.value;
		expect(saved?.refreshToken).toBe("refresh-2");
		expect(saved?.expiresAt).toBe(iso(2 * HOUR));
		// The account's identity survives the renewal.
		expect(saved?.metadata).toEqual({
			accountId: "42",
			accountName: "CodeSphere",
		});
	});

	test("two simultaneous publications renew once, not twice", async () => {
		const store = await seeded(credential());
		const provider = rotatingProvider();
		const source = sourceOf(store, provider.refresh);
		const [a, b] = await Promise.all([source(), source()]);
		expect(provider.calls).toEqual(["refresh-1"]);
		expect(a.accessToken).toBe("access-2");
		expect(b.accessToken).toBe("access-2");
	});

	test("many simultaneous publications still renew once", async () => {
		const store = await seeded(credential());
		const provider = rotatingProvider();
		const source = sourceOf(store, provider.refresh);
		const all = await Promise.all(Array.from({ length: 8 }, () => source()));
		expect(provider.calls).toHaveLength(1);
		expect(new Set(all.map((c) => c.accessToken))).toEqual(
			new Set(["access-2"]),
		);
	});

	test("successive renewals each use the latest refresh token", async () => {
		const store = await seeded(credential());
		const provider = rotatingProvider();
		let clock = NOW;
		const source = sourceOf(store, provider.refresh, { now: () => clock });
		await source();
		clock += 3 * HOUR; // the new token has expired in turn
		const got = await source();
		expect(provider.calls).toEqual(["refresh-1", "refresh-2"]);
		expect(got.accessToken).toBe("access-3");
	});
});

describe("the renewed token is saved before it is used", () => {
	test("the platform sees the new token only after it was stored", async () => {
		const events: string[] = [];
		const store = spied(await seeded(credential()), events);
		const provider = rotatingProvider();
		const post: SharePost = {
			text: "Hello",
			url: "https://codesphere.dev/questions/1",
			idempotencyKey: "share:question:1:x",
		};
		const fetch = (async (
			input: string | URL | Request,
			init?: RequestInit,
		) => {
			const url = String(input);
			if (url.endsWith("/2/tweets")) {
				events.push(
					`posted-with:${new Headers(init?.headers).get("authorization")}`,
				);
				return Response.json({ data: { id: "1", text: "t" } });
			}
			return Response.json({}, { status: 404 });
		}) as unknown as typeof globalThis.fetch;
		const publisher = createPublisher({
			x: { credentials: sourceOf(store, provider.refresh), fetch },
		});
		const [report] = await publisher.publish(post, "x");
		expect(report?.state).toBe("published");
		expect(events).toEqual(["saved:access-2", "posted-with:Bearer access-2"]);
	});

	test("if the new tokens cannot be saved, nothing is posted with them", async () => {
		const memory = await seeded(credential());
		const events: string[] = [];
		const failing: CredentialPort = {
			get: (key) => memory.get(key),
			delete: (key) => memory.delete(key),
			compareAndSet: async () => {
				throw new Error("database down");
			},
		};
		const fetch = (async () => {
			events.push("posted");
			return Response.json({});
		}) as unknown as typeof globalThis.fetch;
		const publisher = createPublisher({
			x: { credentials: sourceOf(failing, rotatingProvider().refresh), fetch },
		});
		const error = await publisher
			.publish(
				{ text: "t", url: "https://codesphere.dev/q/1", idempotencyKey: "k" },
				"x",
			)
			.catch((e: Error) => e);
		expect(error).toBeInstanceOf(SocialAuthError);
		expect((error as SocialAuthError).reason).toBe("refresh-failed");
		expect(events).toEqual([]);
	});
});

describe("when the renewal cannot happen", () => {
	test("no connected account: not-connected", async () => {
		const source = sourceOf(new MemoryCredentialStore(), async (c) => c);
		const error = await source().catch((e: Error) => e);
		expect(error).toBeInstanceOf(SocialAuthError);
		expect((error as SocialAuthError).reason).toBe("not-connected");
	});

	test("a grant the platform refuses flags the account and asks to reconnect", async () => {
		const store = await seeded(credential());
		let flagged = 0;
		const source = sourceOf(
			store,
			async () => {
				throw new SocialError({
					code: "reconnect_required",
					operation: "oauth.refresh",
					message: "invalid_grant",
				});
			},
			{
				onReconnectRequired: async () => {
					flagged += 1;
				},
			},
		);
		const error = await source().catch((e: Error) => e);
		expect((error as SocialAuthError).reason).toBe("reconnect-required");
		expect(flagged).toBe(1);
	});

	test("a network failure is a retryable refresh failure that leaks nothing", async () => {
		const store = await seeded(credential());
		const source = sourceOf(store, async () => {
			throw new TypeError("fetch failed for token=refresh-1");
		});
		const error = await source().catch((e: Error) => e);
		expect((error as SocialAuthError).reason).toBe("refresh-failed");
		expect((error as Error).message).not.toContain("refresh-1");
	});

	test("a renewal that holds the lock too long makes the next one give up: busy", async () => {
		const store = await seeded(credential());
		const lock = new MemoryCredentialLock();
		await lock.acquire("x", 60_000); // someone else holds it
		const source = sourceOf(store, rotatingProvider().refresh, {
			lock,
			waitMs: 30,
		});
		const error = await source().catch((e: Error) => e);
		expect((error as SocialAuthError).reason).toBe("busy");
	});

	test("if an Admin reconnected meanwhile, that newer credential wins", async () => {
		const memory = await seeded(credential());
		const source = sourceOf(memory, async (current) => {
			// The Admin connects the account again while the exchange is in flight.
			const found = await memory.get("x");
			await memory.compareAndSet({
				key: "x",
				expectedRevision: found?.revision,
				value: credential({ accessToken: "reconnected", expiresAt: iso(HOUR) }),
			});
			return { ...current, accessToken: "from-the-old-grant" };
		});
		const got = await source();
		expect(got.accessToken).toBe("reconnected");
	});
});
