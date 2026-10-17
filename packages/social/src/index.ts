import {
	type BackendRegistry,
	connectedAccountRef,
	createSocial,
	type DeliveryOutcome,
	type IdempotencyStore,
	type SocialAdapter,
} from "@opencoredev/social-sdk";
import { bluesky } from "@opencoredev/social-sdk/bluesky";
import { linkedin } from "@opencoredev/social-sdk/linkedin";
import {
	type MockScenario,
	mockBackend,
} from "@opencoredev/social-sdk/testing";
import { x } from "@opencoredev/social-sdk/x";

import type { CredentialSource } from "./credentials";
import { SocialSignInError } from "./errors";

/**
 * Publishing to CodeSphere's own social accounts (ADR 0001, phase 2).
 *
 * The rest of the code never imports `@opencoredev/social-sdk`: it talks to a `SocialPublisher`,
 * so the backend (or the SDK itself, still 0.x) can change without touching callers.
 * Server-side only: it holds platform credentials.
 */

export type SocialPlatform = "bluesky" | "linkedin" | "x";

export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
	"bluesky",
	"linkedin",
	"x",
];

/** What to publish: a sentence and the canonical link of a public page. */
export type SharePost = {
	text: string;
	url: string;
	/** Same key, same post: a retry never publishes twice (`share:{type}:{id}:{platform}`). */
	idempotencyKey: string;
};

export type PublishState =
	| "published"
	| "processing"
	| "failed"
	| "not-submitted"
	| "unknown";

export type PublishReport = {
	platform: SocialPlatform;
	state: PublishState;
	/** Public URL of the post, once published. */
	url?: string;
	message?: string;
	/** A failure the caller may retry later with the same key. */
	retryable?: boolean;
	/**
	 * The platform refused the account's token: nothing was posted, and the account must be
	 * connected again before a retry can succeed (#266). Never a publication.
	 */
	authFailure?: boolean;
};

export interface SocialPublisher {
	/** Platforms that have credentials on this deployment. */
	readonly platforms: readonly SocialPlatform[];
	publish(post: SharePost, platform: SocialPlatform): Promise<PublishReport[]>;
}

/** A post's text budget per platform. */
const BLUESKY_MAX = 300;
const LINKEDIN_MAX = 3000;
const X_MAX = 280;
/** X counts every link as 23 characters, whatever its length. */
const X_URL_WEIGHT = 23;

/**
 * Weight of a text on X: most Latin characters count 1, everything else (emoji, CJK, Arabic...) 2.
 * Slightly stricter than needed on purpose: a refusal costs an Admin a click, a wrong cut costs nothing.
 */
export function xWeight(text: string): number {
	let weight = 0;
	for (const char of text) {
		const code = char.codePointAt(0) ?? 0;
		const light =
			code <= 4351 ||
			(code >= 8192 && code <= 8205) ||
			(code >= 8208 && code <= 8223) ||
			(code >= 8242 && code <= 8247);
		weight += light ? 1 : 2;
	}
	return weight;
}

function shorten(text: string, fits: (candidate: string) => boolean): string {
	if (fits(text)) {
		return text;
	}
	const chars = [...text];
	let end = chars.length;
	while (end > 0 && !fits(`${chars.slice(0, end).join("").trimEnd()}…`)) {
		end -= 1;
	}
	return end > 0 ? `${chars.slice(0, end).join("").trimEnd()}…` : "";
}

/** The post text with its link on its own line, the text shortened (never the link) to fit. */
export function composeText(
	post: SharePost,
	platform: SocialPlatform = "bluesky",
): string {
	const text = post.text.trim();
	if (platform === "x") {
		const body = shorten(text, (t) => xWeight(t) + 1 + X_URL_WEIGHT <= X_MAX);
		return `${body}\n${post.url}`;
	}
	const max = platform === "linkedin" ? LINKEDIN_MAX : BLUESKY_MAX;
	const body = shorten(text, (t) => [...t].length + 1 + post.url.length <= max);
	return `${body}\n${post.url}`;
}

function toReport(
	platform: SocialPlatform,
	outcome: DeliveryOutcome,
): PublishReport {
	switch (outcome.state) {
		case "published":
			return { platform, state: "published", url: outcome.url };
		case "accepted":
		case "processing":
		case "scheduled":
			return { platform, state: "processing" };
		case "failed": {
			// A token the platform rejects posts nothing: retrying after a reconnection is safe.
			const authFailure =
				outcome.code === "reconnect_required" ||
				outcome.retryDisposition.kind === "after-reconnect";
			return {
				platform,
				state: "failed",
				message: outcome.message,
				retryable: outcome.retryDisposition.kind !== "never",
				...(authFailure ? { authFailure: true } : {}),
			};
		}
		case "not-submitted":
			return {
				platform,
				state: "not-submitted",
				message: outcome.reason,
				retryable: outcome.reason === "capacity",
			};
		default:
			// "unknown" and "cancelled": the platform may or may not have the post. Never re-send blindly.
			return { platform, state: "unknown" };
	}
}

/** Publishes one post to the one account behind `adapter`. */
function publishVia(
	platform: SocialPlatform,
	adapter: SocialAdapter<unknown>,
	accountId: string,
	idempotencyStore: IdempotencyStore | undefined,
) {
	const social = createSocial({
		backend: adapter,
		...(idempotencyStore ? { idempotencyStore } : {}),
	});
	return async (post: SharePost): Promise<PublishReport[]> => {
		const result = await social.posts.publish({
			targets: [
				{
					account: connectedAccountRef({
						backend: "default",
						platform,
						accountId,
					}),
				},
			],
			content: { text: composeText(post, platform) },
			idempotencyKey: post.idempotencyKey,
		});
		return result.outcomes.map((outcome) => toReport(platform, outcome));
	};
}

function publisherOf(
	routes: Partial<
		Record<SocialPlatform, (post: SharePost) => Promise<PublishReport[]>>
	>,
): SocialPublisher {
	return {
		platforms: SOCIAL_PLATFORMS.filter((p) => routes[p]),
		async publish(post, platform) {
			const route = routes[platform];
			if (!route) {
				throw new Error(`No credentials for ${platform}`);
			}
			return route(post);
		},
	};
}

type Common = { idempotencyStore?: IdempotencyStore; fetch?: typeof fetch };

/** A publisher that sends nothing to any network: tests and local development. */
export function createMockPublisher(
	options: {
		scenario?: MockScenario;
		idempotencyStore?: IdempotencyStore;
	} = {},
) {
	const backend = mockBackend({
		scenario: options.scenario ?? "immediate-text-success",
	});
	const route = (platform: SocialPlatform) =>
		publishVia(
			platform,
			backend as unknown as SocialAdapter<unknown>,
			"mock-account-1",
			options.idempotencyStore,
		);
	return {
		publisher: publisherOf({
			bluesky: route("bluesky"),
			linkedin: route("linkedin"),
			x: route("x"),
		}),
		/** What the mock received, for assertions. */
		history: () => backend.testing.history(),
	};
}

export type BlueskyConfig = Common & {
	/** PDS origin, e.g. https://bsky.social */
	service: string;
	/** Handle or DID of the official account. */
	identifier: string;
	/** An app password, never the account password. */
	appPassword: string;
};

type Session = { did: string; accessJwt: string };

/**
 * Bluesky signs in with an app password and gets a short-lived access token; the SDK does not
 * refresh it. So a session is opened for each publish: low volume (an Admin's click), no token kept.
 */
function blueskyRoute(config: BlueskyConfig) {
	const doFetch = config.fetch ?? globalThis.fetch;
	const service = config.service.replace(/\/$/, "");

	async function openSession(): Promise<Session> {
		const response = await doFetch(
			`${service}/xrpc/com.atproto.server.createSession`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					identifier: config.identifier,
					password: config.appPassword,
				}),
			},
		);
		if (!response.ok) {
			throw new SocialSignInError(
				`Bluesky sign-in failed (${response.status})`,
			);
		}
		const body = (await response.json()) as Partial<Session>;
		if (!body.did || !body.accessJwt) {
			throw new SocialSignInError("Bluesky sign-in returned no session");
		}
		return { did: body.did, accessJwt: body.accessJwt };
	}

	return async (post: SharePost) => {
		const session = await openSession();
		const adapter = bluesky({
			auth: { service, did: session.did, accessJwt: session.accessJwt },
			fetch: doFetch,
		}) as SocialAdapter<unknown>;
		return publishVia(
			"bluesky",
			adapter,
			session.did,
			config.idempotencyStore,
		)(post);
	};
}

export type LinkedInConfig = Common & {
	/** LinkedIn's monthly API version, e.g. 202609. Upgrade after reading their migration notes. */
	apiVersion: string;
} & (
		| {
				/** A member access token with the `w_member_social` (person) or `w_organization_social` scope. */
				accessToken: string;
				/** `urn:li:person:…` or `urn:li:organization:…`: the account the post is published as. */
				author: string;
		  }
		| {
				/** The stored, renewed credential of the connected account (#266). */
				credentials: CredentialSource;
		  }
	);

const LINKEDIN_AUTHOR = /^urn:li:(person|organization):.+/;

function linkedinRoute(config: LinkedInConfig) {
	let resolve: CredentialSource;
	if ("credentials" in config) {
		resolve = config.credentials;
	} else {
		const { accessToken, author } = config;
		if (!LINKEDIN_AUTHOR.test(author)) {
			throw new Error(
				"LinkedIn author must be a urn:li:person or urn:li:organization",
			);
		}
		resolve = async () => ({ accessToken, accountId: author });
	}
	// One adapter per publication: the token may have been renewed since the last one.
	return async (post: SharePost) => {
		const { accessToken, accountId } = await resolve();
		if (!LINKEDIN_AUTHOR.test(accountId)) {
			throw new SocialSignInError("The connected LinkedIn account is invalid.");
		}
		const adapter = linkedin({
			auth: {
				accessToken,
				author: accountId as `urn:li:person:${string}`,
			},
			apiVersion: config.apiVersion,
			...(config.fetch ? { fetch: config.fetch } : {}),
		}) as SocialAdapter<unknown>;
		return publishVia(
			"linkedin",
			adapter,
			accountId,
			config.idempotencyStore,
		)(post);
	};
}

export type XConfig = Common &
	(
		| {
				/** Numeric id of the official X account. */
				userId: string;
				/** An OAuth 2.0 user access token with `tweet.write` and `users.read`. */
				accessToken: string;
		  }
		| {
				/** The stored, renewed credential of the connected account (#266). */
				credentials: CredentialSource;
		  }
	);

function xRoute(config: XConfig) {
	let resolve: CredentialSource;
	if ("credentials" in config) {
		resolve = config.credentials;
	} else {
		const { accessToken, userId } = config;
		resolve = async () => ({ accessToken, accountId: userId });
	}
	return async (post: SharePost) => {
		const { accessToken, accountId } = await resolve();
		const adapter = x({
			auth: { userId: accountId, accessToken },
			...(config.fetch ? { fetch: config.fetch } : {}),
		}) as SocialAdapter<unknown>;
		return publishVia("x", adapter, accountId, config.idempotencyStore)(post);
	};
}

export type SocialConfig = {
	bluesky?: BlueskyConfig;
	linkedin?: LinkedInConfig;
	x?: XConfig;
};

/** A publisher over the platforms that have a configuration. */
export function createPublisher(config: SocialConfig): SocialPublisher {
	return publisherOf({
		...(config.bluesky ? { bluesky: blueskyRoute(config.bluesky) } : {}),
		...(config.linkedin ? { linkedin: linkedinRoute(config.linkedin) } : {}),
		...(config.x ? { x: xRoute(config.x) } : {}),
	});
}

/** Bluesky only: kept for callers and tests that need nothing else. */
export function createBlueskyPublisher(config: BlueskyConfig): SocialPublisher {
	return createPublisher({ bluesky: config });
}

export type SocialEnv = {
	BLUESKY_SERVICE?: string;
	BLUESKY_IDENTIFIER?: string;
	BLUESKY_APP_PASSWORD?: string;
	LINKEDIN_ACCESS_TOKEN?: string;
	LINKEDIN_AUTHOR?: string;
	LINKEDIN_API_VERSION?: string;
	X_USER_ID?: string;
	X_ACCESS_TOKEN?: string;
};

/** LinkedIn version used when none is set; the SDK documents 202609 as an example. */
export const DEFAULT_LINKEDIN_API_VERSION = "202609";

/**
 * The publisher over every platform whose credentials are all set, or null when none is (the
 * feature is off). A platform with only some of its variables is left out, never half-configured.
 *
 * LinkedIn and X use `options.credentials` when given: the stored accounts an Admin connected,
 * renewed before they expire (#266). Without it they fall back to a static token from the
 * environment, which only suits a quick trial (X's lasts about two hours).
 */
export function publisherFromEnv(
	env: SocialEnv,
	options: {
		idempotencyStore?: IdempotencyStore;
		credentials?: { linkedin?: CredentialSource; x?: CredentialSource };
	} = {},
): SocialPublisher | null {
	const common = options.idempotencyStore
		? { idempotencyStore: options.idempotencyStore }
		: {};
	const config: SocialConfig = {};
	if (env.BLUESKY_IDENTIFIER && env.BLUESKY_APP_PASSWORD) {
		config.bluesky = {
			service: env.BLUESKY_SERVICE || "https://bsky.social",
			identifier: env.BLUESKY_IDENTIFIER,
			appPassword: env.BLUESKY_APP_PASSWORD,
			...common,
		};
	}
	const linkedinVersion =
		env.LINKEDIN_API_VERSION || DEFAULT_LINKEDIN_API_VERSION;
	if (options.credentials?.linkedin) {
		config.linkedin = {
			credentials: options.credentials.linkedin,
			apiVersion: linkedinVersion,
			...common,
		};
	} else if (env.LINKEDIN_ACCESS_TOKEN && env.LINKEDIN_AUTHOR) {
		config.linkedin = {
			accessToken: env.LINKEDIN_ACCESS_TOKEN,
			author: env.LINKEDIN_AUTHOR,
			apiVersion: linkedinVersion,
			...common,
		};
	}
	if (options.credentials?.x) {
		config.x = { credentials: options.credentials.x, ...common };
	} else if (env.X_USER_ID && env.X_ACCESS_TOKEN) {
		config.x = {
			userId: env.X_USER_ID,
			accessToken: env.X_ACCESS_TOKEN,
			...common,
		};
	}
	const publisher = createPublisher(config);
	return publisher.platforms.length > 0 ? publisher : null;
}

export type {
	CredentialLease,
	CredentialLock,
	StoredCredential,
} from "@opencoredev/social-sdk/server";
export { MemoryIdempotencyStore } from "@opencoredev/social-sdk/testing";
export {
	type AccountCredential,
	type CredentialPort,
	type CredentialSource,
	type CredentialSourceOptions,
	createCredentialSource,
	waitingLock,
} from "./credentials";
export {
	SocialAuthError,
	type SocialAuthReason,
	SocialConnectError,
	SocialSignInError,
} from "./errors";
export {
	beginAuthorization,
	type ConnectedAccount,
	completeAuthorization,
	createPkce,
	OAUTH_PLATFORMS,
	type OAuthApp,
	type OAuthPlatform,
	oauthRefresher,
} from "./oauth";
export { createVault, type Vault, VaultError } from "./vault";
export type { BackendRegistry, IdempotencyStore };
