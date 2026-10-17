/// <reference types="bun" />
// The official accounts' tokens on a real Postgres (#266): encrypted at rest, renewed once under
// the database lease, saved before use, and connected through a single-use, admin-bound OAuth attempt.
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { user } from "@codesphere/db/schema/auth";
import {
	socialConnectAttempt,
	socialCredential,
	socialCredentialLock,
} from "@codesphere/db/schema/social";
import { createVault, SocialConnectError } from "@codesphere/social";
import { eq, inArray } from "drizzle-orm";

import {
	createPgCredentialLock,
	createPgCredentialStore,
	createSocialAccounts,
} from "./social-accounts";

const url = process.env.TEST_DATABASE_URL;
// Generated per run: a literal would be flagged by the secret scan.
const SECRET = `${crypto.randomUUID()}${crypto.randomUUID()}`;
const SITE = "https://codesphere.test";
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

describe.skipIf(!url)("social accounts on Postgres (#266)", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const vault = createVault(SECRET);
	const run = crypto.randomUUID();
	const admin = `it-sa-admin-${run}`;
	const other = `it-sa-other-${run}`;

	beforeAll(async () => {
		await db.insert(user).values([
			{ id: admin, name: "Admin", email: `${admin}@example.com` },
			{ id: other, name: "Other", email: `${other}@example.com` },
		]);
	});

	afterEach(async () => {
		await db.delete(socialCredential);
		await db.delete(socialCredentialLock);
		await db.delete(socialConnectAttempt);
		await db.delete(auditLog).where(inArray(auditLog.actorId, [admin, other]));
	});

	afterAll(async () => {
		await db.delete(auditLog).where(inArray(auditLog.actorId, [admin, other]));
		await db.delete(user).where(inArray(user.id, [admin, other]));
	});

	/** A fake X: single-use refresh tokens, a counter of exchanges. */
	function fakeX() {
		const spent = new Set<string>();
		const valid = new Set(["refresh-1"]);
		const state = { exchanges: 0, seen: [] as string[], issued: 1 };
		const fetch = (async (
			input: string | URL | Request,
			init?: RequestInit,
		) => {
			const target = String(input);
			const body = String(init?.body ?? "");
			if (target.includes("oauth2/token")) {
				if (body.includes("grant_type=refresh_token")) {
					const used = new URLSearchParams(body).get("refresh_token") ?? "";
					state.seen.push(used);
					await new Promise((resolve) => setTimeout(resolve, 30));
					if (spent.has(used) || !valid.has(used)) {
						return Response.json({ error: "invalid_grant" }, { status: 400 });
					}
					spent.add(used);
					state.exchanges += 1;
					state.issued += 1;
					valid.add(`refresh-${state.issued}`);
					return Response.json({
						access_token: `access-${state.issued}`,
						refresh_token: `refresh-${state.issued}`,
						expires_in: 7200,
						token_type: "bearer",
					});
				}
				return Response.json({
					access_token: "access-1",
					refresh_token: "refresh-1",
					expires_in: 7200,
					scope: "tweet.write users.read offline.access",
					token_type: "bearer",
				});
			}
			return Response.json({
				data: { id: "42", name: "CodeSphere", username: "codesphere" },
			});
		}) as unknown as typeof globalThis.fetch;
		return { state, fetch };
	}

	const accountsWith = (fetch: typeof globalThis.fetch) =>
		createSocialAccounts({
			db,
			vault,
			siteUrl: SITE,
			apps: { x: { clientId: "cid", fetch } },
		});

	async function connect(
		accounts: ReturnType<typeof accountsWith>,
		by = admin,
	) {
		const page = new URL(await accounts.begin("x", by));
		const state = page.searchParams.get("state") ?? "";
		return accounts.complete(
			by,
			`${SITE}/admin/social/callback?code=abc&state=${state}`,
		);
	}

	async function expireStored(expiresAtMs: number) {
		await db
			.update(socialCredential)
			.set({ expiresAt: new Date(expiresAtMs) })
			.where(eq(socialCredential.platform, "x"));
	}

	// The stored JSON also holds the expiry; rewrite the sealed value so the renewal sees it stale.
	async function makeStale() {
		const store = createPgCredentialStore(db, vault);
		const found = await store.get("x");
		if (!found) {
			throw new Error("not connected");
		}
		await store.compareAndSet({
			key: "x",
			expectedRevision: found.revision,
			value: { ...found.value, expiresAt: iso(-60_000) },
		});
	}

	test("connecting stores the account encrypted: no token in the table", async () => {
		const { fetch } = fakeX();
		const accounts = accountsWith(fetch);
		const done = await connect(accounts);
		expect(done.platform).toBe("x");
		const [row] = await db.select().from(socialCredential);
		const dump = JSON.stringify(row);
		expect(dump).not.toContain("access-1");
		expect(dump).not.toContain("refresh-1");
		expect(row?.sealed.startsWith("v1.")).toBe(true);
		const status = (await accounts.status()).find((s) => s.platform === "x");
		expect(status).toMatchObject({
			connected: true,
			configured: true,
			status: "connected",
		});
		expect(JSON.stringify(status)).not.toContain("access-1");
		// Another secret cannot read it.
		const wrong = createPgCredentialStore(db, createVault(`${SECRET}-other`));
		await expect(wrong.get("x")).rejects.toThrow();
	});

	test("a callback is single-use and bound to the Admin who started it", async () => {
		const { fetch } = fakeX();
		const accounts = accountsWith(fetch);
		const state =
			new URL(await accounts.begin("x", admin)).searchParams.get("state") ?? "";
		const callback = `${SITE}/admin/social/callback?code=abc&state=${state}`;
		await expect(accounts.complete(other, callback)).rejects.toBeInstanceOf(
			SocialConnectError,
		);
		await accounts.complete(admin, callback);
		// Replaying it finds nothing.
		await expect(accounts.complete(admin, callback)).rejects.toBeInstanceOf(
			SocialConnectError,
		);
		await expect(
			accounts.complete(admin, `${SITE}/admin/social/callback?state=forged`),
		).rejects.toBeInstanceOf(SocialConnectError);
		expect((await db.select().from(socialConnectAttempt)).length).toBe(0);
	});

	test("an expired attempt is refused", async () => {
		const { fetch } = fakeX();
		const accounts = accountsWith(fetch);
		const state =
			new URL(await accounts.begin("x", admin)).searchParams.get("state") ?? "";
		await db
			.update(socialConnectAttempt)
			.set({ expiresAt: new Date(Date.now() - 1000) });
		await expect(
			accounts.complete(
				admin,
				`${SITE}/admin/social/callback?code=abc&state=${state}`,
			),
		).rejects.toBeInstanceOf(SocialConnectError);
	});

	test("two simultaneous publications renew the token once (database lease)", async () => {
		const platform = fakeX();
		const accounts = accountsWith(platform.fetch);
		await connect(accounts);
		await makeStale();
		const source = accounts.sources.x;
		if (!source) {
			throw new Error("no source");
		}
		const [a, b, c] = await Promise.all([source(), source(), source()]);
		expect(platform.state.exchanges).toBe(1);
		expect(platform.state.seen).toEqual(["refresh-1"]);
		expect(new Set([a.accessToken, b.accessToken, c.accessToken])).toEqual(
			new Set(["access-2"]),
		);
		// The rotated refresh token is what is stored now.
		const stored = await createPgCredentialStore(db, vault).get("x");
		expect(stored?.value.refreshToken).toBe("refresh-2");
		expect(stored?.value.metadata?.accountId).toBe("42");
	});

	test("the lease is exclusive, then released", async () => {
		const lock = createPgCredentialLock(db);
		const first = await lock.acquire("x", 30_000);
		expect(first).toBeDefined();
		expect(await lock.acquire("x", 30_000)).toBeUndefined();
		if (first) {
			await lock.release(first);
		}
		expect(await lock.acquire("x", 30_000)).toBeDefined();
	});

	test("a lease abandoned by a dead worker is taken over once it expires", async () => {
		const lock = createPgCredentialLock(db);
		await lock.acquire("x", 30_000);
		await db
			.update(socialCredentialLock)
			.set({ expiresAt: new Date(Date.now() - 1000) });
		expect(await lock.acquire("x", 30_000)).toBeDefined();
	});

	test("a refused grant flags the account and asks to reconnect", async () => {
		const platform = fakeX();
		const accounts = accountsWith(platform.fetch);
		await connect(accounts);
		await makeStale();
		// Spend refresh-1 elsewhere: the platform now refuses it.
		const store = createPgCredentialStore(db, vault);
		const found = await store.get("x");
		await store.compareAndSet({
			key: "x",
			expectedRevision: found?.revision,
			value: {
				...(found?.value as NonNullable<typeof found>["value"]),
				refreshToken: "never-issued",
			},
		});
		await expect(accounts.sources.x?.()).rejects.toMatchObject({
			reason: "reconnect-required",
		});
		const status = (await accounts.status()).find((s) => s.platform === "x");
		expect(status?.status).toBe("reconnect-required");
		// Connecting again clears it.
		await connect(accounts);
		expect(
			(await accounts.status()).find((s) => s.platform === "x")?.status,
		).toBe("connected");
	});

	test("a save over a changed revision is refused (compare-and-set)", async () => {
		const { fetch } = fakeX();
		await connect(accountsWith(fetch));
		const store = createPgCredentialStore(db, vault);
		const found = await store.get("x");
		const value = found?.value as NonNullable<typeof found>["value"];
		const first = await store.compareAndSet({
			key: "x",
			expectedRevision: found?.revision,
			value: { ...value, accessToken: "one" },
		});
		const second = await store.compareAndSet({
			key: "x",
			expectedRevision: found?.revision,
			value: { ...value, accessToken: "two" },
		});
		expect(first.updated).toBe(true);
		expect(second.updated).toBe(false);
		expect((await store.get("x"))?.value.accessToken).toBe("one");
	});

	test("disconnecting forgets the account and is audited; connecting is audited too", async () => {
		const { fetch } = fakeX();
		const accounts = accountsWith(fetch);
		await connect(accounts);
		expect(await accounts.disconnect("x", admin)).toBe(true);
		expect(await accounts.disconnect("x", admin)).toBe(false);
		await expect(accounts.sources.x?.()).rejects.toMatchObject({
			reason: "not-connected",
		});
		const events = await db
			.select({ action: auditLog.action, details: auditLog.details })
			.from(auditLog)
			.where(eq(auditLog.actorId, admin));
		expect(events.map((e) => e.action).sort()).toEqual([
			"social.connect",
			"social.disconnect",
		]);
		// No token in the audit trail.
		expect(JSON.stringify(events)).not.toContain("access-");
	});

	test("a platform without an OAuth application cannot be connected", async () => {
		const accounts = createSocialAccounts({
			db,
			vault,
			siteUrl: SITE,
			apps: {},
		});
		await expect(accounts.begin("linkedin", admin)).rejects.toBeInstanceOf(
			SocialConnectError,
		);
		expect(accounts.sources.linkedin).toBeUndefined();
		expect((await accounts.status()).every((s) => !s.configured)).toBe(true);
	});

	test("expiry is stored for the back-office", async () => {
		const { fetch } = fakeX();
		const accounts = accountsWith(fetch);
		await connect(accounts);
		await expireStored(Date.now() + 3_600_000);
		const status = (await accounts.status()).find((s) => s.platform === "x");
		expect(status?.expiresAt?.getTime()).toBeGreaterThan(Date.now());
	});
});
