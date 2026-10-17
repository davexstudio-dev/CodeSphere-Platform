import {
	type BackendRegistry,
	connectedAccountRef,
	createSocial,
	type DeliveryOutcome,
	type IdempotencyStore,
	type SocialAdapter,
} from "@opencoredev/social-sdk";
import { bluesky } from "@opencoredev/social-sdk/bluesky";
import {
	type MockScenario,
	mockBackend,
} from "@opencoredev/social-sdk/testing";

/**
 * Publishing to CodeSphere's own social accounts (ADR 0001, phase 2).
 *
 * The rest of the code never imports `@opencoredev/social-sdk`: it talks to a `SocialPublisher`,
 * so the backend (or the SDK itself, still 0.x) can change without touching callers.
 * Server-side only: it holds platform credentials.
 */

export type SocialPlatform = "bluesky";

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
};

export interface SocialPublisher {
	readonly platforms: readonly SocialPlatform[];
	publish(post: SharePost): Promise<PublishReport[]>;
}

/** Bluesky caps a post at 300 characters. */
const BLUESKY_MAX = 300;

/** The post text with its link, the text shortened (not the link) to fit `max` characters. */
export function composeText(post: SharePost, max = BLUESKY_MAX): string {
	const room = max - post.url.length - 1;
	const text = post.text.trim();
	const body =
		text.length <= room
			? text
			: `${text.slice(0, Math.max(0, room - 1)).trimEnd()}…`;
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
		case "failed":
			return {
				platform,
				state: "failed",
				message: outcome.message,
				retryable: outcome.retryDisposition.kind !== "never",
			};
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

function publisherOver(
	platform: SocialPlatform,
	adapter: SocialAdapter<unknown>,
	accountId: string,
	idempotencyStore: IdempotencyStore | undefined,
): SocialPublisher {
	const social = createSocial({
		backend: adapter,
		...(idempotencyStore ? { idempotencyStore } : {}),
	});
	return {
		platforms: [platform],
		async publish(post) {
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
				content: { text: composeText(post) },
				idempotencyKey: post.idempotencyKey,
			});
			return result.outcomes.map((outcome) => toReport(platform, outcome));
		},
	};
}

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
	return {
		publisher: publisherOver(
			"bluesky",
			backend as unknown as SocialAdapter<unknown>,
			"mock-account-1",
			options.idempotencyStore,
		),
		/** What the mock received, for assertions. */
		history: () => backend.testing.history(),
	};
}

export type BlueskyConfig = {
	/** PDS origin, e.g. https://bsky.social */
	service: string;
	/** Handle or DID of the official account. */
	identifier: string;
	/** An app password, never the account password. */
	appPassword: string;
	idempotencyStore?: IdempotencyStore;
	fetch?: typeof globalThis.fetch;
};

type Session = { did: string; accessJwt: string };

/**
 * Signing in failed before anything was sent: nothing was published, retrying is safe.
 * Any other error thrown by a publisher leaves the post's fate unknown.
 */
export class SocialSignInError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SocialSignInError";
	}
}

/**
 * Bluesky signs in with an app password and gets a short-lived access token; the SDK does not
 * refresh it. So a session is opened for each publish: low volume (an Admin's click), no token kept.
 */
export function createBlueskyPublisher(config: BlueskyConfig): SocialPublisher {
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

	return {
		platforms: ["bluesky"],
		async publish(post) {
			const session = await openSession();
			const adapter = bluesky({
				auth: { service, did: session.did, accessJwt: session.accessJwt },
				fetch: doFetch,
			}) as SocialAdapter<unknown>;
			return publisherOver(
				"bluesky",
				adapter,
				session.did,
				config.idempotencyStore,
			).publish(post);
		},
	};
}

export type SocialEnv = {
	BLUESKY_SERVICE?: string;
	BLUESKY_IDENTIFIER?: string;
	BLUESKY_APP_PASSWORD?: string;
};

/** The configured publisher, or null when no platform has credentials (feature off). */
export function publisherFromEnv(
	env: SocialEnv,
	options: { idempotencyStore?: IdempotencyStore } = {},
): SocialPublisher | null {
	if (env.BLUESKY_IDENTIFIER && env.BLUESKY_APP_PASSWORD) {
		return createBlueskyPublisher({
			service: env.BLUESKY_SERVICE || "https://bsky.social",
			identifier: env.BLUESKY_IDENTIFIER,
			appPassword: env.BLUESKY_APP_PASSWORD,
			...options,
		});
	}
	return null;
}

export { MemoryIdempotencyStore } from "@opencoredev/social-sdk/testing";
export type { BackendRegistry, IdempotencyStore };
