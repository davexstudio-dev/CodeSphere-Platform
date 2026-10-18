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

/** Why an official account could not provide a usable access token (#266). */
export type SocialAuthReason =
	/** Nobody connected this account yet. */
	| "not-connected"
	/** The platform no longer honours the stored grant: an Admin must connect it again. */
	| "reconnect-required"
	/** The renewal failed for another reason (network, platform error): worth trying again later. */
	| "refresh-failed"
	/** Another renewal held the credential for too long. */
	| "busy";

/**
 * The account has no usable token. Nothing was sent, so the publication is retryable (once the
 * account is reconnected, for `reconnect-required`). The message is safe to show an Admin: it
 * never carries a token or a provider response.
 */
export class SocialAuthError extends SocialSignInError {
	readonly reason: SocialAuthReason;
	constructor(reason: SocialAuthReason, message: string) {
		super(message);
		this.name = "SocialAuthError";
		this.reason = reason;
	}
}

/** The OAuth connection of an account failed; the message is safe to show an Admin. */
export class SocialConnectError extends Error {
	readonly reason: "cancelled" | "failed" | "wrong-account";
	constructor(reason: SocialConnectError["reason"], message: string) {
		super(message);
		this.name = "SocialConnectError";
		this.reason = reason;
	}
}
