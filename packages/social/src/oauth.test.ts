/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { SocialConnectError } from "./errors";
import {
	beginAuthorization,
	completeAuthorization,
	createPkce,
	oauthRefresher,
} from "./oauth";

const REDIRECT = "https://codesphere.dev/admin/social/callback";

type Call = { url: string; body: string; auth: string | null };

function platformFake(respond: (call: Call) => Response) {
	const calls: Call[] = [];
	const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const call = {
			url: String(input),
			body: String(init?.body ?? ""),
			auth: new Headers(init?.headers).get("authorization"),
		};
		calls.push(call);
		return respond(call);
	}) as unknown as typeof globalThis.fetch;
	return { calls, fetch };
}

describe("createPkce", () => {
	test("gives a state, a verifier and the S256 challenge of that verifier", async () => {
		const pkce = await createPkce();
		const digest = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(pkce.codeVerifier),
		);
		const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
		expect(pkce.codeChallenge).toBe(expected);
		expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);
		expect(pkce.state).not.toBe((await createPkce()).state);
	});
});

describe("beginAuthorization", () => {
	test("X: sends the Admin to X with the state, the challenge and the callback", async () => {
		const url = new URL(
			await beginAuthorization(
				"x",
				{ clientId: "cid" },
				{
					redirectUri: REDIRECT,
					state: "st",
					codeChallenge: "ch",
				},
			),
		);
		expect(url.hostname).toContain("x.com");
		expect(url.searchParams.get("client_id")).toBe("cid");
		expect(url.searchParams.get("state")).toBe("st");
		expect(url.searchParams.get("code_challenge")).toBe("ch");
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
		expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
		expect(url.searchParams.get("scope")).toContain("offline.access");
	});

	test("LinkedIn: asks for the Page scopes only when posting as a Page", async () => {
		const asMember = new URL(
			await beginAuthorization(
				"linkedin",
				{ clientId: "cid", linkedinApiVersion: "202609" },
				{
					redirectUri: REDIRECT,
					state: "st",
					codeChallenge: "ch",
				},
			),
		);
		expect(asMember.hostname).toContain("linkedin.com");
		expect(asMember.searchParams.get("scope")).toContain("w_member_social");
		expect(asMember.searchParams.get("scope")).not.toContain(
			"w_organization_social",
		);
		const asPage = new URL(
			await beginAuthorization(
				"linkedin",
				{
					clientId: "cid",
					linkedinApiVersion: "202609",
					linkedinAuthor: "urn:li:organization:9",
				},
				{ redirectUri: REDIRECT, state: "st", codeChallenge: "ch" },
			),
		);
		expect(asPage.searchParams.get("scope")).toContain("w_organization_social");
	});
});

describe("completeAuthorization", () => {
	const attempt = {
		redirectUri: REDIRECT,
		state: "st",
		codeVerifier: "v".repeat(50),
	};

	test("a callback for another state is refused and nothing is exchanged", async () => {
		const { calls, fetch } = platformFake(() => Response.json({}));
		const error = await completeAuthorization(
			"x",
			{ clientId: "cid", fetch },
			{ ...attempt, callbackUrl: `${REDIRECT}?code=abc&state=forged` },
		).catch((e: Error) => e);
		expect(error).toBeInstanceOf(SocialConnectError);
		expect(calls).toEqual([]);
	});

	test("an Admin who refused on the platform is a cancellation", async () => {
		const { fetch } = platformFake(() => Response.json({}));
		const error = await completeAuthorization(
			"x",
			{ clientId: "cid", fetch },
			{ ...attempt, callbackUrl: `${REDIRECT}?error=access_denied&state=st` },
		).catch((e: Error) => e);
		expect(error).toBeInstanceOf(SocialConnectError);
		expect(["cancelled", "failed"]).toContain(
			(error as SocialConnectError).reason,
		);
	});

	test("X: exchanges the code with the verifier and returns the account and its tokens", async () => {
		const { calls, fetch } = platformFake((call) => {
			if (call.url.includes("oauth2/token")) {
				return Response.json({
					access_token: "at",
					refresh_token: "rt",
					expires_in: 7200,
					scope: "tweet.write users.read offline.access",
					token_type: "bearer",
				});
			}
			return Response.json({
				data: { id: "42", name: "CodeSphere", username: "codesphere" },
			});
		});
		const connected = await completeAuthorization(
			"x",
			{ clientId: "cid", fetch },
			{ ...attempt, callbackUrl: `${REDIRECT}?code=abc&state=st` },
		);
		expect(connected.accountId).toBe("42");
		expect(connected.credential.accessToken).toBe("at");
		expect(connected.credential.refreshToken).toBe("rt");
		expect(connected.credential.expiresAt).toBeDefined();
		expect(connected.credential.metadata).toEqual({
			accountId: "42",
			accountName: connected.accountName,
		});
		const exchange = calls.find((c) => c.url.includes("oauth2/token"));
		expect(exchange?.body).toContain(`code_verifier=${attempt.codeVerifier}`);
		expect(exchange?.body).toContain("code=abc");
	});

	test("a failed exchange never leaks the platform's answer", async () => {
		const { fetch } = platformFake(() =>
			Response.json(
				{ error: "invalid_grant", detail: "secret-detail" },
				{ status: 400 },
			),
		);
		const error = await completeAuthorization(
			"x",
			{ clientId: "cid", fetch },
			{ ...attempt, callbackUrl: `${REDIRECT}?code=abc&state=st` },
		).catch((e: Error) => e);
		expect(error).toBeInstanceOf(SocialConnectError);
		expect((error as Error).message).not.toContain("secret-detail");
	});
});

describe("oauthRefresher", () => {
	const current = {
		accessToken: "old-access",
		refreshToken: "old-refresh",
		expiresAt: "2020-01-01T00:00:00.000Z",
		metadata: { accountId: "42", accountName: "CodeSphere" },
	};

	test("X: the rotated refresh token replaces the spent one; identity is kept", async () => {
		const { calls, fetch } = platformFake(() =>
			Response.json({
				access_token: "new-access",
				refresh_token: "new-refresh",
				expires_in: 7200,
				token_type: "bearer",
			}),
		);
		const next = await oauthRefresher("x", { clientId: "cid", fetch })(current);
		expect(calls[0]?.body).toContain("grant_type=refresh_token");
		expect(calls[0]?.body).toContain("refresh_token=old-refresh");
		expect(next.accessToken).toBe("new-access");
		expect(next.refreshToken).toBe("new-refresh");
		expect(Date.parse(next.expiresAt ?? "")).toBeGreaterThan(Date.now());
		expect(next.metadata).toEqual(current.metadata);
	});

	test("a response without a new refresh token keeps the current one", async () => {
		const { fetch } = platformFake(() =>
			Response.json({
				access_token: "new-access",
				expires_in: 3600,
				token_type: "bearer",
			}),
		);
		const next = await oauthRefresher("x", { clientId: "cid", fetch })(current);
		expect(next.refreshToken).toBe("old-refresh");
	});

	test("a response without an expiry does not keep the stale one", async () => {
		const { fetch } = platformFake(() =>
			Response.json({ access_token: "new-access", token_type: "bearer" }),
		);
		const next = await oauthRefresher("x", { clientId: "cid", fetch })(current);
		expect(next.expiresAt).toBeUndefined();
	});

	test("a credential with no refresh token cannot be renewed: reconnect", async () => {
		const { calls, fetch } = platformFake(() => Response.json({}));
		const { refreshToken: _unused, ...noRefresh } = current;
		await expect(
			oauthRefresher("linkedin", { clientId: "cid", fetch })(noRefresh),
		).rejects.toMatchObject({ code: "reconnect_required" });
		expect(calls).toEqual([]);
	});

	test("a refused grant is reconnect_required", async () => {
		const { fetch } = platformFake(() =>
			Response.json({ error: "invalid_grant" }, { status: 400 }),
		);
		await expect(
			oauthRefresher("x", { clientId: "cid", fetch })(current),
		).rejects.toMatchObject({ code: "reconnect_required" });
	});
});
