import type { Context as ApiContext } from "@codesphere/api/context";
import { carriesApiKey, sessionForRequest } from "@codesphere/api/suspension";
import type { LoggerEnv } from "@codesphere/logger";
import type { Context as HonoContext } from "hono";

import type { AppDeps } from "./app";
import { reportRequestError } from "./report";

export type CreateContextOptions = {
	context: HonoContext<LoggerEnv>;
	deps: Pick<
		AppDeps,
		| "auth"
		| "db"
		| "release"
		| "notifications"
		| "social"
		| "reporter"
		| "privilegeThresholds"
		| "teamDeps"
		| "writeQuota"
		| "agentRules"
		| "farmingLimits"
		| "feedRanking"
		| "superAdminEmails"
	>;
};

export async function createContext({
	context,
	deps,
}: CreateContextOptions): Promise<ApiContext> {
	// An invalid or revoked API key makes better-auth throw; treat it as "not authenticated"
	// so procedures answer UNAUTHORIZED instead of a 500. A key over its rate limit is the
	// exception: it must answer 429, not 401 (spec §3), so the wait is kept for the router.
	const headers = context.req.raw.headers;
	let apiKeyRetryAfter: number | undefined;
	const session = await deps.auth.api.getSession({ headers }).catch((error) => {
		apiKeyRetryAfter = rateLimitRetryAfter(error);
		return null;
	});
	return {
		apiKeyRetryAfter,
		db: deps.db,
		// A suspended Member's API keys stop being accepted (#123).
		session: sessionForRequest(session, carriesApiKey(headers)),
		logger: context.get("logger"),
		requestId: context.get("requestId"),
		traceId: context.get("traceId"),
		reportError: (error) =>
			reportRequestError(
				deps.reporter,
				context.get("logger"),
				{
					traceId: context.get("traceId"),
					requestId: context.get("requestId"),
					method: context.req.method,
					path: context.req.path,
				},
				error,
			),
		release: deps.release,
		privilegeThresholds: deps.privilegeThresholds,
		teamDeps: deps.teamDeps,
		writeQuota: deps.writeQuota,
		agentRules: deps.agentRules,
		farmingLimits: deps.farmingLimits,
		feedRanking: deps.feedRanking,
		notifications: deps.notifications,
		social: deps.social,
		superAdminEmails: deps.superAdminEmails,
	};
}

/**
 * Seconds to wait when `error` is better-auth's refusal of a rate-limited API key, else undefined.
 * The plugin reports `tryAgainIn` in milliseconds.
 */
export function rateLimitRetryAfter(error: unknown): number | undefined {
	const refusal = error as
		| {
				statusCode?: number;
				body?: { details?: { tryAgainIn?: number }; tryAgainIn?: number };
		  }
		| undefined;
	if (refusal?.statusCode !== 429) {
		return undefined;
	}
	const wait =
		refusal.body?.details?.tryAgainIn ?? refusal.body?.tryAgainIn ?? 60_000;
	return Math.max(1, Math.ceil(wait / 1000));
}

export type Context = Awaited<ReturnType<typeof createContext>>;
