import type { Session } from "@codesphere/auth";
import type { Database } from "@codesphere/db";
import type { Logger } from "@codesphere/logger";
import type { SocialPublisher } from "@codesphere/social";

export type Context = {
	session: Session | null;
	db: Database;
	/** Child logger bound to the request id (#59). */
	logger: Logger;
	/** Id of the HTTP request, returned in `x-request-id` and in INTERNAL_SERVER_ERROR. */
	requestId: string;
	/**
	 * Seconds until the request's API key may be used again, when the key went over its 120
	 * requests per minute (spec §3): every procedure then answers TOO_MANY_REQUESTS, not
	 * UNAUTHORIZED.
	 */
	apiKeyRetryAfter?: number;
	/**
	 * Messages the API sends on its own initiative (#52). Optional: a deployment or a test with no
	 * mail provider leaves it out, and a failed send never fails the request.
	 */
	notifications?: {
		apiKeyCreated(
			member: { email: string; name: string },
			keyName: string,
		): Promise<void>;
	};
	/**
	 * Publishing to CodeSphere's own social accounts (#265). Optional: a deployment without
	 * credentials leaves `publisher` null and the admin procedure answers SERVICE_UNAVAILABLE.
	 */
	social?: {
		publisher: SocialPublisher | null;
		/** Public origin of the web app, used to build the links that are posted. */
		siteUrl?: string;
	};
	/** Build identity injected at build time (APP_VERSION, GIT_SHA). */
	release: { version: string; commit: string };
};
