import { SocialError } from "@opencoredev/social-sdk";
import {
	type CredentialLease,
	type CredentialLock,
	CredentialManager,
	type StoredCredential,
} from "@opencoredev/social-sdk/server";

import { SocialAuthError } from "./errors";

/**
 * Tokens of the official accounts that expire (#266): a stored credential is renewed before it
 * does, by ONE worker at a time, and the new token is saved BEFORE it is used.
 *
 * Why it matters: X's refresh token is single-use. If two publications each exchanged it, the
 * second exchange would fail and the account would be lost; if the new token were used before
 * being saved, a crash would lose it. So: a lock around the renewal, a revision check on the save
 * (the SDK's `CredentialManager.rotate`), and a refresh callback that first re-reads the credential
 * under the lock, so a worker that waited finds the fresh token and exchanges nothing.
 */

/** The token to publish with, and the account it belongs to. */
export type AccountCredential = { accessToken: string; accountId: string };
export type CredentialSource = () => Promise<AccountCredential>;

/** The persistence the renewal needs; the SDK's own `CredentialStore` shape. */
export interface CredentialPort {
	get(
		key: string,
	): Promise<{ value: StoredCredential; revision: string } | undefined>;
	compareAndSet(input: {
		key: string;
		expectedRevision: string | undefined;
		value: StoredCredential;
	}): Promise<{ updated: boolean; revision?: string }>;
	delete(key: string): Promise<void>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The SDK's `rotate` fails at once when the lock is taken. A publication that arrives while
 * another one renews should wait for it and use the fresh token, so the lock waits for its holder.
 */
export function waitingLock(
	lock: CredentialLock,
	options: { waitMs?: number; pollMs?: number } = {},
): CredentialLock {
	const waitMs = options.waitMs ?? 15_000;
	const pollMs = options.pollMs ?? 100;
	return {
		async acquire(key, ttlMs): Promise<CredentialLease | undefined> {
			const deadline = Date.now() + waitMs;
			for (;;) {
				const lease = await lock.acquire(key, ttlMs);
				if (lease || Date.now() >= deadline) {
					return lease;
				}
				await sleep(pollMs);
			}
		},
		release: (lease) => lock.release(lease),
	};
}

export type CredentialSourceOptions = {
	/** Key of the credential in the store: the platform. */
	key: string;
	store: CredentialPort;
	lock: CredentialLock;
	/** Exchanges the stored credential for a new one at the platform. Never called when it is fresh. */
	refresh: (current: StoredCredential) => Promise<StoredCredential>;
	/** Renew when the token expires within this window. Default 5 minutes. */
	renewWithinMs?: number;
	/** How long a renewal may hold the lock. Default 30 s: longer than the OAuth request timeout. */
	lockTtlMs?: number;
	/** How long a worker waits for another one's renewal. Default 15 s. */
	waitMs?: number;
	pollMs?: number;
	now?: () => number;
	/** The platform refused the grant: flag the account so the Admin sees it must be connected again. */
	onReconnectRequired?: () => Promise<void>;
};

export function createCredentialSource(
	options: CredentialSourceOptions,
): CredentialSource {
	const { key, store } = options;
	const now = options.now ?? Date.now;
	const renewWithin = options.renewWithinMs ?? 5 * 60_000;
	const manager = new CredentialManager(
		store,
		waitingLock(options.lock, {
			...(options.waitMs !== undefined ? { waitMs: options.waitMs } : {}),
			...(options.pollMs !== undefined ? { pollMs: options.pollMs } : {}),
		}),
		options.lockTtlMs ?? 30_000,
	);

	// A token with no known expiry is used as it is.
	const stale = (credential: StoredCredential) =>
		credential.expiresAt !== undefined &&
		Date.parse(credential.expiresAt) - now() <= renewWithin;

	async function renew(): Promise<StoredCredential> {
		try {
			return await manager.rotate(key, async (current) =>
				// Re-checked under the lock: a worker that waited finds the token already renewed.
				stale(current) ? await options.refresh(current) : current,
			);
		} catch (error) {
			if (error instanceof SocialAuthError) {
				throw error;
			}
			if (error instanceof SocialError) {
				if (error.code === "reconnect_required") {
					await options.onReconnectRequired?.();
					throw new SocialAuthError(
						"reconnect-required",
						"The account must be connected again.",
					);
				}
				if (error.operation === "credentials.rotate") {
					// The lock stayed taken, or the credential changed while we renewed (an Admin
					// reconnected it): what is stored now wins, if it is usable.
					const again = await store.get(key);
					if (again && !stale(again.value)) {
						return again.value;
					}
					throw new SocialAuthError(
						"busy",
						"Another renewal of this account is in progress; try again shortly.",
					);
				}
			}
			throw new SocialAuthError(
				"refresh-failed",
				"The access token of the account could not be renewed.",
			);
		}
	}

	return async () => {
		const found = await store.get(key);
		if (!found) {
			throw new SocialAuthError("not-connected", "No account is connected.");
		}
		const value = stale(found.value) ? await renew() : found.value;
		const accountId = value.metadata?.accountId;
		if (!accountId) {
			throw new SocialAuthError("not-connected", "No account is connected.");
		}
		return { accessToken: value.accessToken, accountId };
	};
}
