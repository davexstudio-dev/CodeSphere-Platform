export type SocialAccountView = {
	configured: boolean;
	connected: boolean;
	expiresAt: string | null;
	status: "connected" | "reconnect-required" | null;
};

export type AccountState =
	| "not-configured"
	| "not-connected"
	| "reconnect-required"
	| "connected";

/**
 * What an Admin sees for an official account (#266). An expired access token is not a state of its
 * own: it renews on the next publication. The one state that needs the Admin is a grant the
 * platform refused (`reconnect-required`).
 */
export function accountState(account: SocialAccountView): AccountState {
	if (!account.configured) {
		return "not-configured";
	}
	if (!account.connected) {
		return "not-connected";
	}
	if (account.status === "reconnect-required") {
		return "reconnect-required";
	}
	return "connected";
}

/** Whether the stored access token is past its expiry (it renews by itself when it can). */
export function isExpired(expiresAt: string | null, now = Date.now()) {
	return expiresAt !== null && Date.parse(expiresAt) <= now;
}

/** The message to show for a failed connection: the server's, when it gave a safe one. */
export function connectErrorMessage(
	failure: unknown,
	fallback: string,
): string {
	const error = failure as { code?: string; message?: string } | null;
	return error?.code === "CONFLICT" && error.message ? error.message : fallback;
}

/**
 * The platforms a post can go to now (#265). A connected OAuth account takes over from a deployment
 * secret, so an account still to connect or reconnect would only fail: it is not offered.
 */
export function publishablePlatforms<P extends string>(
	platforms: readonly P[],
	accounts: readonly (SocialAccountView & { platform: string })[],
): P[] {
	return platforms.filter((platform) => {
		const account = accounts.find((row) => row.platform === platform);
		if (!account) {
			return true;
		}
		const state = accountState(account);
		return state === "connected" || state === "not-configured";
	});
}

/** Only a published post is a success: anything else asks the Admin to read what happened. */
export function publicationTone(
	state: "published" | "processing" | "failed" | "unknown",
): "default" | "destructive" {
	return state === "published" ? "default" : "destructive";
}

/** The message key for a publication the server refused. */
export function publishErrorKey(
	failure: unknown,
): "conflict" | "notFound" | "unavailable" | "rateLimited" | "generic" {
	switch ((failure as { code?: string } | null)?.code) {
		case "CONFLICT":
			return "conflict";
		case "NOT_FOUND":
			return "notFound";
		case "SERVICE_UNAVAILABLE":
			return "unavailable";
		case "TOO_MANY_REQUESTS":
			return "rateLimited";
		default:
			return "generic";
	}
}

/** The Questions an Admin can pick: the server refuses an Agent's, so they are not offered. */
export function shareableQuestions(
	questions: readonly {
		id: string;
		title: string;
		authorKind: "human" | "agent";
	}[],
) {
	return questions
		.filter((question) => question.authorKind === "human")
		.map((question) => ({ value: question.id, label: question.title }));
}
