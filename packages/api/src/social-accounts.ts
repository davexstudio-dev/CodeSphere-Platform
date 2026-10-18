import type { Database } from "@codesphere/db";
import {
	type SocialCredentialStatus,
	socialConnectAttempt,
	socialCredential,
	socialCredentialLock,
} from "@codesphere/db/schema/social";
import {
	beginAuthorization,
	type CredentialLease,
	type CredentialLock,
	type CredentialPort,
	type CredentialSource,
	completeAuthorization,
	createCredentialSource,
	createPkce,
	OAUTH_PLATFORMS,
	type OAuthApp,
	type OAuthPlatform,
	oauthRefresher,
	SocialConnectError,
	type StoredCredential,
	type Vault,
} from "@codesphere/social";
import { and, eq, gt, lt, sql } from "drizzle-orm";

import { withAudit } from "./audit";

/**
 * The official X and LinkedIn accounts (#266, ADR 0001): where their tokens are kept (encrypted,
 * in Postgres), how they are renewed without two workers exchanging the same single-use refresh
 * token, and the OAuth flow an Admin uses to connect or reconnect one.
 */

const ATTEMPT_TTL_MS = 10 * 60_000;
const SAVE_ATTEMPTS = 3;

/** Opens a stored credential; null when the row is missing. */
const parse = (plain: string): StoredCredential =>
	JSON.parse(plain) as StoredCredential;

/**
 * The credential rows. Every save is a compare-and-set on `revision`, so a renewal never
 * overwrites what an Admin connected in the meantime. A failed write is retried: the exchange
 * has already spent the old refresh token, so losing the new one would lose the account.
 */
export function createPgCredentialStore(
	db: Database,
	vault: Vault,
): CredentialPort {
	const read = async (key: string) => {
		const [row] = await db
			.select({
				sealed: socialCredential.sealed,
				revision: socialCredential.revision,
			})
			.from(socialCredential)
			.where(eq(socialCredential.platform, key as OAuthPlatform));
		return row
			? {
					value: parse(await vault.open(row.sealed, key)),
					revision: String(row.revision),
				}
			: undefined;
	};

	return {
		get: read,
		async compareAndSet({ key, expectedRevision, value }) {
			const platform = key as OAuthPlatform;
			const sealed = await vault.seal(JSON.stringify(value), key);
			const expiresAt = value.expiresAt ? new Date(value.expiresAt) : null;
			if (expectedRevision === undefined) {
				const rows = await db
					.insert(socialCredential)
					.values({
						platform,
						sealed,
						expiresAt,
						accountId: value.metadata?.accountId ?? "",
						accountName: value.metadata?.accountName ?? "",
					})
					.onConflictDoNothing()
					.returning({ revision: socialCredential.revision });
				return rows[0]
					? { updated: true, revision: String(rows[0].revision) }
					: { updated: false };
			}
			let lastError: unknown;
			for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
				try {
					const rows = await db
						.update(socialCredential)
						.set({
							sealed,
							expiresAt,
							status: "connected",
							revision: sql`${socialCredential.revision} + 1`,
							updatedAt: sql`now()`,
						})
						.where(
							and(
								eq(socialCredential.platform, platform),
								eq(socialCredential.revision, Number(expectedRevision)),
							),
						)
						.returning({ revision: socialCredential.revision });
					if (rows[0]) {
						return { updated: true, revision: String(rows[0].revision) };
					}
					if (attempt > 0) {
						// An earlier attempt may have landed although its answer was lost.
						const stored = await read(key);
						if (stored?.value.accessToken === value.accessToken) {
							return { updated: true, revision: stored.revision };
						}
					}
					return { updated: false };
				} catch (error) {
					lastError = error;
				}
			}
			throw lastError;
		},
		async delete(key) {
			await db
				.delete(socialCredential)
				.where(eq(socialCredential.platform, key as OAuthPlatform));
		},
	};
}

/** One renewal at a time per account, across processes: a lease that expires if its holder dies. */
export function createPgCredentialLock(db: Database): CredentialLock {
	return {
		async acquire(key, ttlMs): Promise<CredentialLease | undefined> {
			const token = crypto.randomUUID();
			const rows = await db
				.insert(socialCredentialLock)
				.values({
					key,
					token,
					expiresAt: sql`now() + (${ttlMs}::int * interval '1 millisecond')`,
				})
				.onConflictDoUpdate({
					target: socialCredentialLock.key,
					set: {
						token: sql`excluded.token`,
						expiresAt: sql`excluded.expires_at`,
					},
					setWhere: lt(socialCredentialLock.expiresAt, sql`now()`),
				})
				.returning({ key: socialCredentialLock.key });
			return rows[0]
				? {
						key,
						token,
						expiresAt: new Date(Date.now() + ttlMs).toISOString(),
					}
				: undefined;
		},
		async release(lease) {
			await db
				.delete(socialCredentialLock)
				.where(
					and(
						eq(socialCredentialLock.key, lease.key),
						eq(socialCredentialLock.token, lease.token),
					),
				);
		},
	};
}

export type SocialAccountStatus = {
	platform: OAuthPlatform;
	/** The OAuth application of this platform is configured: an Admin can connect an account. */
	configured: boolean;
	connected: boolean;
	accountName: string | null;
	/** When the access token expires; it is renewed by itself before, when the platform allows. */
	expiresAt: Date | null;
	/** `reconnect-required`: the platform refused the stored grant; an Admin must connect again. */
	status: SocialCredentialStatus | null;
	connectedAt: Date | null;
};

export type SocialAccountsOptions = {
	db: Database;
	vault: Vault;
	/** The registered OAuth applications; a platform without one cannot be connected. */
	apps: Partial<Record<OAuthPlatform, OAuthApp>>;
	/** Public origin of the web app: the callback is `${siteUrl}/admin/social/callback`. */
	siteUrl: string;
};

export type SocialAccounts = ReturnType<typeof createSocialAccounts>;

export function createSocialAccounts(options: SocialAccountsOptions) {
	const { db, vault, apps } = options;
	const redirectUri = `${options.siteUrl.replace(/\/$/, "")}/admin/social/callback`;
	const store = createPgCredentialStore(db, vault);
	const lock = createPgCredentialLock(db);

	const sources: Partial<Record<OAuthPlatform, CredentialSource>> = {};
	for (const platform of OAUTH_PLATFORMS) {
		const app = apps[platform];
		if (!app) {
			continue;
		}
		sources[platform] = createCredentialSource({
			key: platform,
			store,
			lock,
			refresh: oauthRefresher(platform, app),
			onReconnectRequired: async () => {
				await db
					.update(socialCredential)
					.set({ status: "reconnect-required", updatedAt: sql`now()` })
					.where(eq(socialCredential.platform, platform));
			},
		});
	}

	return {
		/** Per platform, what the publisher resolves its token from. */
		sources,

		async status(): Promise<SocialAccountStatus[]> {
			const rows = await db
				.select({
					platform: socialCredential.platform,
					accountName: socialCredential.accountName,
					expiresAt: socialCredential.expiresAt,
					status: socialCredential.status,
					connectedAt: socialCredential.connectedAt,
				})
				.from(socialCredential);
			return OAUTH_PLATFORMS.map((platform) => {
				const row = rows.find((r) => r.platform === platform);
				return {
					platform,
					configured: Boolean(apps[platform]),
					connected: Boolean(row),
					accountName: row?.accountName ?? null,
					expiresAt: row?.expiresAt ?? null,
					status: row?.status ?? null,
					connectedAt: row?.connectedAt ?? null,
				};
			});
		},

		/** Starts the OAuth flow of `adminId`: the page of the platform where to grant access. */
		async begin(platform: OAuthPlatform, adminId: string): Promise<string> {
			const app = apps[platform];
			if (!app) {
				throw new SocialConnectError(
					"failed",
					"This platform has no OAuth application configured.",
				);
			}
			const pkce = await createPkce();
			await db
				.delete(socialConnectAttempt)
				.where(lt(socialConnectAttempt.expiresAt, sql`now()`));
			await db.insert(socialConnectAttempt).values({
				state: pkce.state,
				platform,
				sealedVerifier: await vault.seal(
					pkce.codeVerifier,
					`attempt:${pkce.state}`,
				),
				requestedBy: adminId,
				expiresAt: sql`now() + (${ATTEMPT_TTL_MS}::int * interval '1 millisecond')`,
			});
			return beginAuthorization(platform, app, {
				redirectUri,
				state: pkce.state,
				codeChallenge: pkce.codeChallenge,
			});
		},

		/**
		 * Finishes the flow from the URL the platform redirected to. The attempt is single-use and
		 * bound to the Admin who started it: a forged, replayed or foreign callback finds nothing.
		 */
		async complete(adminId: string, callbackUrl: string) {
			const refused = () =>
				new SocialConnectError(
					"failed",
					"This connection attempt is unknown or has expired; start it again.",
				);
			let state: string | null;
			try {
				state = new URL(callbackUrl).searchParams.get("state");
			} catch {
				throw refused();
			}
			if (!state) {
				throw refused();
			}
			const [attempt] = await db
				.delete(socialConnectAttempt)
				.where(
					and(
						eq(socialConnectAttempt.state, state),
						eq(socialConnectAttempt.requestedBy, adminId),
						gt(socialConnectAttempt.expiresAt, sql`now()`),
					),
				)
				.returning({
					platform: socialConnectAttempt.platform,
					sealedVerifier: socialConnectAttempt.sealedVerifier,
				});
			const app = attempt && apps[attempt.platform];
			if (!attempt || !app) {
				throw refused();
			}
			const connected = await completeAuthorization(attempt.platform, app, {
				callbackUrl,
				redirectUri,
				state,
				codeVerifier: await vault.open(
					attempt.sealedVerifier,
					`attempt:${state}`,
				),
			});
			const sealed = await vault.seal(
				JSON.stringify(connected.credential),
				attempt.platform,
			);
			const expiresAt = connected.credential.expiresAt
				? new Date(connected.credential.expiresAt)
				: null;
			await withAudit(
				db,
				{
					actorId: adminId,
					action: "social.connect",
					targetType: "social_credential",
					targetIdColumn: "platform",
					details: { fields: [attempt.platform] },
				},
				db
					.insert(socialCredential)
					.values({
						platform: attempt.platform,
						sealed,
						expiresAt,
						accountId: connected.accountId,
						accountName: connected.accountName,
						connectedBy: adminId,
					})
					.onConflictDoUpdate({
						target: socialCredential.platform,
						set: {
							sealed,
							expiresAt,
							accountId: connected.accountId,
							accountName: connected.accountName,
							status: "connected",
							connectedBy: adminId,
							connectedAt: sql`now()`,
							updatedAt: sql`now()`,
							revision: sql`${socialCredential.revision} + 1`,
						},
					})
					.returning({ platform: socialCredential.platform }),
			);
			return {
				platform: attempt.platform,
				accountName: connected.accountName,
			};
		},

		/** Forgets the stored account; publishing to the platform then asks to connect it again. */
		async disconnect(platform: OAuthPlatform, adminId: string) {
			const rows = await withAudit(
				db,
				{
					actorId: adminId,
					action: "social.disconnect",
					targetType: "social_credential",
					targetIdColumn: "platform",
					details: { fields: [platform] },
				},
				db
					.delete(socialCredential)
					.where(eq(socialCredential.platform, platform))
					.returning({ platform: socialCredential.platform }),
			);
			return rows.length === 1;
		},
	};
}
