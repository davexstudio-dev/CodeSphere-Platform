import { SocialError } from "@opencoredev/social-sdk";
import {
	type ConnectionAccount,
	type ConnectionAttempt,
	linkedinOAuth,
	type OAuthProviderOptions,
	type OAuthTokenSet,
	refreshOAuthToken,
	type StoredCredential,
	xOAuth,
} from "@opencoredev/social-sdk/server";

import { SocialConnectError } from "./errors";

/**
 * Connecting an official X or LinkedIn account and renewing its tokens (#266).
 *
 * The provider-specific parts (endpoints, scopes, the code exchange, discovering which account the
 * token belongs to, the refresh grant) come from the SDK's OAuth providers; where the attempt and
 * the tokens are kept is up to the caller. The SDK's `ConnectionManager` is not used: it is built
 * around tenants and grants, and a single official account per platform needs neither.
 */

export type OAuthPlatform = "x" | "linkedin";

export const OAUTH_PLATFORMS: readonly OAuthPlatform[] = ["x", "linkedin"];

/** The platform's registered application (the OAuth client), not the account. */
export type OAuthApp = {
	clientId: string;
	clientSecret?: string;
	/** LinkedIn only: its monthly API version (YYYYMM). */
	linkedinApiVersion?: string;
	/** LinkedIn only: the `urn:li:organization:…` to post as; the member itself when unset. */
	linkedinAuthor?: string;
	fetch?: typeof fetch;
};

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/** What an authorization attempt needs: the `state`, the PKCE verifier and its S256 challenge. */
export async function createPkce() {
	const random = () => base64Url(crypto.getRandomValues(new Uint8Array(32)));
	const codeVerifier = random();
	const digest = await crypto.subtle.digest(
		"SHA-256",
		encoder.encode(codeVerifier),
	);
	return {
		state: random(),
		codeVerifier,
		codeChallenge: base64Url(new Uint8Array(digest)),
	};
}

const LINKEDIN_MEMBER_SCOPES = ["openid", "profile", "w_member_social"];
// Posting as a Page also needs these, and listing the Pages the member administers.
const LINKEDIN_PAGE_SCOPES = ["w_organization_social", "rw_organization_admin"];

function linkedinScopes(author: string | undefined) {
	return author?.startsWith("urn:li:organization:")
		? [...LINKEDIN_MEMBER_SCOPES, ...LINKEDIN_PAGE_SCOPES]
		: LINKEDIN_MEMBER_SCOPES;
}

function optionsOf(app: OAuthApp): OAuthProviderOptions {
	return {
		clientId: app.clientId,
		...(app.clientSecret ? { clientSecret: app.clientSecret } : {}),
		...(app.linkedinApiVersion
			? { linkedinApiVersion: app.linkedinApiVersion }
			: {}),
		...(app.fetch ? { fetch: app.fetch } : {}),
	};
}

function providerOf(
	platform: OAuthPlatform,
	app: OAuthApp,
	extra: Partial<OAuthProviderOptions> = {},
) {
	const options = { ...optionsOf(app), ...extra };
	return platform === "x"
		? xOAuth(options)
		: linkedinOAuth({
				...options,
				scopes: options.scopes ?? linkedinScopes(app.linkedinAuthor),
			});
}

/** The page of the platform where the Admin grants access. */
export async function beginAuthorization(
	platform: OAuthPlatform,
	app: OAuthApp,
	input: { redirectUri: string; state: string; codeChallenge: string },
): Promise<string> {
	try {
		const { authorizationUrl } = await providerOf(platform, app).start({
			platforms: [platform],
			capabilities: [],
			redirectUri: input.redirectUri,
			state: input.state,
			codeChallenge: input.codeChallenge,
		});
		return authorizationUrl;
	} catch {
		throw new SocialConnectError(
			"failed",
			"The authorization page could not be prepared.",
		);
	}
}

export type ConnectedAccount = {
	accountId: string;
	accountName: string;
	credential: StoredCredential;
};

/** The account to keep among those the token can post as. */
function pick(
	platform: OAuthPlatform,
	app: OAuthApp,
	accounts: readonly ConnectionAccount[],
): string[] {
	if (platform === "linkedin" && app.linkedinAuthor) {
		const wanted = accounts.find(
			(account) => account.ref.accountId === app.linkedinAuthor,
		);
		if (!wanted) {
			throw new SocialConnectError(
				"wrong-account",
				"This LinkedIn login cannot post as the configured account.",
			);
		}
		return [wanted.ref.accountId];
	}
	const first = accounts[0];
	return first ? [first.ref.accountId] : [];
}

/**
 * Exchanges the code of the callback for tokens and finds out which account they belong to.
 * `callbackUrl` is checked against the attempt's `redirectUri` and `state`.
 */
export async function completeAuthorization(
	platform: OAuthPlatform,
	app: OAuthApp,
	input: {
		callbackUrl: string;
		redirectUri: string;
		state: string;
		codeVerifier: string;
	},
): Promise<ConnectedAccount> {
	let captured:
		| { account: ConnectionAccount; token: OAuthTokenSet }
		| undefined;
	const provider = providerOf(platform, app, {
		selectAccounts: (accounts) => pick(platform, app, accounts),
		credentialSink: {
			async save({ account, token }) {
				captured = { account, token };
			},
		},
	});
	const now = new Date();
	const attempt: ConnectionAttempt = {
		id: input.state,
		backend: "default",
		tenantId: "codesphere",
		principalId: "admin",
		platforms: [platform],
		capabilities: [],
		redirectUri: input.redirectUri,
		state: input.state,
		codeVerifier: input.codeVerifier,
		createdAt: now.toISOString(),
		expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
	};
	try {
		await provider.complete({ callbackUrl: input.callbackUrl, attempt });
	} catch (error) {
		if (error instanceof SocialConnectError) {
			throw error;
		}
		if (error instanceof SocialError && error.code === "cancelled") {
			throw new SocialConnectError(
				"cancelled",
				"The authorization was cancelled.",
			);
		}
		throw new SocialConnectError(
			"failed",
			"The platform did not confirm the connection.",
		);
	}
	if (!captured) {
		throw new SocialConnectError("failed", "The platform returned no account.");
	}
	const { account, token } = captured;
	return {
		accountId: account.ref.accountId,
		accountName: account.displayName,
		credential: {
			accessToken: token.accessToken,
			...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
			...(token.expiresAt ? { expiresAt: token.expiresAt } : {}),
			...(token.scopes ? { scopes: [...token.scopes] } : {}),
			metadata: {
				accountId: account.ref.accountId,
				accountName: account.displayName,
			},
		},
	};
}

/**
 * The refresh grant for a stored credential. An account whose platform grants no refresh token
 * (LinkedIn does only to some applications) fails with `reconnect_required`: the Admin connects
 * it again before it expires.
 */
export function oauthRefresher(platform: OAuthPlatform, app: OAuthApp) {
	return async (current: StoredCredential): Promise<StoredCredential> => {
		const next = await refreshOAuthToken(platform, optionsOf(app), {
			accessToken: current.accessToken,
			...(current.refreshToken ? { refreshToken: current.refreshToken } : {}),
			...(current.expiresAt ? { expiresAt: current.expiresAt } : {}),
			...(current.scopes ? { scopes: current.scopes } : {}),
		});
		const scopes = next.scopes ?? current.scopes;
		const refreshToken = next.refreshToken ?? current.refreshToken;
		// Rebuilt, not spread: a stale `expiresAt` must not outlive a response that gives none.
		return {
			accessToken: next.accessToken,
			// X's refresh token rotates: the new one replaces the old, which is now spent.
			...(refreshToken ? { refreshToken } : {}),
			...(next.expiresAt ? { expiresAt: next.expiresAt } : {}),
			...(scopes ? { scopes: [...scopes] } : {}),
			// The account never changes by renewing: its identity is kept.
			...(current.metadata ? { metadata: current.metadata } : {}),
		};
	};
}
