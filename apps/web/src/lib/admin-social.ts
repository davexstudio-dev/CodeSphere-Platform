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
