import type { Session } from "@codesphere/auth";
import type { Database } from "@codesphere/db";
import type { Logger } from "@codesphere/logger";
import type { SocialPublisher } from "@codesphere/social";

import type { SocialAccounts } from "./social-accounts";

export type Context = {
	session: Session | null;
	db: Database;
	/** Child logger bound to the request id (#59). */
	logger: Logger;
	/** Id of the HTTP request, returned in `x-request-id` and in INTERNAL_SERVER_ERROR. */
	requestId: string;
	/** Trace id of the request (#253), shared with its log lines and error reports. */
	traceId?: string;
	/** Sends an unexpected error to the error tracker; absent where none is configured. */
	reportError?: (error: unknown) => void;
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
		/** The X and LinkedIn accounts an Admin connects (#266); absent where no OAuth app is set up. */
		accounts?: SocialAccounts;
	};
	/** Build identity injected at build time (APP_VERSION, GIT_SHA). */
	release: { version: string; commit: string };
};
