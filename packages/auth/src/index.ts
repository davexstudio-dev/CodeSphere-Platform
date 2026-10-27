import { apiKey } from "@better-auth/api-key";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { CONSENT_VERSION } from "@codesphere/contract/consent";
import { DEFAULT_ROLE, ROLES, STAFF_ROLES } from "@codesphere/contract/roles";
import type { Database } from "@codesphere/db";
import * as schema from "@codesphere/db/schema/auth";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { admin, emailOTP, oAuthProxy } from "better-auth/plugins";
import { eq } from "drizzle-orm";

import { ac, roles } from "./access";
import { parseAdminEmails, roleAtSignIn, roleFor } from "./admin";
import { readConsent } from "./consent";
import { displayNameFor } from "./display-name";
import { type OAuthProxyEnv, oauthProxyFrom } from "./oauth-proxy";
import { type SocialProviderEnv, socialProvidersFrom } from "./providers";
import { isRefusedProxyCallback } from "./proxy-target";
import { acceptStaffInvitation } from "./staff-invitation";
import { withoutOAuthTokens } from "./tokens";

export type AuthConfig = SocialProviderEnv &
	OAuthProxyEnv & {
		BETTER_AUTH_URL: string;
		BETTER_AUTH_SECRET: string;
		CORS_ORIGIN: string;
		/** Origin of the back-office host (production): trusted for auth calls, like CORS_ORIGIN. */
		ADMIN_ORIGIN?: string;
		/** Parent domain (e.g. codesphereplatform.xyz) so the session cookie reaches the back-office host. */
		COOKIE_DOMAIN?: string;
		SUPER_ADMIN_EMAILS?: string;
		ADMIN_EMAILS?: string;
		MODERATOR_EMAILS?: string;
		/** Sign in with a one-time code sent by email: for local development and previews, where SSO cannot work. */
		EMAIL_OTP_SIGNIN?: boolean;
	};

const stripTokens = async <T extends object>(account: T) => ({
	data: withoutOAuthTokens(account),
});

/** What the auth layer tells the outside world about a new account: no email client here. */
export type NewMember = { id: string; email: string; name: string };

export type AuthHooks = {
	/**
	 * Called once, after a human account is created (never for an Agent). `acceptLanguage` is the
	 * header of the sign-in request. A failure never blocks the sign-in.
	 */
	onMemberCreated?: (
		member: NewMember,
		acceptLanguage: string | null,
	) => Promise<void>;
	/** Delivers a sign-in code. Only called when `EMAIL_OTP_SIGNIN` is on. */
	sendSignInOtp?: (
		email: string,
		otp: string,
		acceptLanguage: string | null,
	) => Promise<void>;
};

export function createAuth(
	env: AuthConfig,
	database: Database,
	desktopOrigins: readonly string[] = [],
	hooks: AuthHooks = {},
) {
	const staff = {
		superAdmins: parseAdminEmails(env.SUPER_ADMIN_EMAILS),
		admins: parseAdminEmails(env.ADMIN_EMAILS),
		moderators: parseAdminEmails(env.MODERATOR_EMAILS),
	};
	const proxy = oauthProxyFrom(env);

	return betterAuth({
		database: drizzleAdapter(database, {
			provider: "pg",
			schema,
		}),
		trustedOrigins: [
			env.CORS_ORIGIN,
			...(env.ADMIN_ORIGIN ? [env.ADMIN_ORIGIN] : []),
			...desktopOrigins,
		],
		// Staging only: refuse a proxy callback that would send a member to an origin other than
		// staging or one preview (#149). The plugin redirects to whatever its state carries.
		hooks: proxy
			? {
					before: createAuthMiddleware(async (ctx) => {
						if (ctx.path !== "/callback/:id") {
							return;
						}
						const state = ctx.query?.state;
						if (typeof state !== "string") {
							return;
						}
						if (
							!(await isRefusedProxyCallback(
								state,
								proxy.secret,
								proxy.productionURL,
							))
						) {
							return;
						}
						ctx.context.logger.error(
							"OAuth proxy: refused a callback target outside staging and previews",
						);
						// The sign-in page shows a generic failure for unknown codes (sign-in-error.ts).
						throw ctx.redirect(
							`${proxy.productionURL}/signin?error=invalid_callback`,
						);
					}),
				}
			: undefined,
		// SSO, and no email/password sign-in (#59, spec §3). The email code below is opt-in
		// (EMAIL_OTP_SIGNIN), on in previews, staging and production.
		socialProviders: socialProvidersFrom(env),
		account: {
			// Link provider accounts on a verified email only: no trusted providers, so an
			// unverified address is rejected instead of being merged (spec §3).
			accountLinking: { enabled: true, trustedProviders: [] },
		},
		databaseHooks: {
			account: {
				// First sign-in and linking create the account; a later sign-in updates its tokens.
				create: { before: stripTokens },
				update: { before: stripTokens },
			},
			session: {
				create: {
					// The role lives in the database (#285); a sign-in only puts a SUPER_ADMIN_EMAILS
					// member back to super_admin. Humans only: an Agent is never staff.
					before: async (session) => {
						const [row] = await database
							.select({
								email: schema.user.email,
								emailVerified: schema.user.emailVerified,
								kind: schema.user.kind,
								role: schema.user.role,
							})
							.from(schema.user)
							.where(eq(schema.user.id, session.userId));
						if (row && row.kind === "human") {
							const role = roleAtSignIn(row, staff);
							if (role !== row.role) {
								await database
									.update(schema.user)
									.set({ role })
									.where(eq(schema.user.id, session.userId));
							}
							// An invitation (#286) raises the role of a verified email, once.
							if (row.emailVerified) {
								await acceptStaffInvitation(database, {
									id: session.userId,
									email: row.email,
									role,
								});
							}
						}
						return { data: session };
					},
				},
			},
			user: {
				create: {
					before: async (user, ctx) => {
						// No consent, no account (spec §3).
						const consent = readConsent(
							ctx?.headers?.get("cookie"),
							CONSENT_VERSION,
							new Date(),
						);
						if (!consent.accepted) {
							return false;
						}
						return {
							data: {
								...user,
								name: displayNameFor(user.name, user.email),
								role: roleFor(user, staff),
								consentVersion: consent.consentVersion,
								consentAcceptedAt: consent.consentAcceptedAt,
							},
						};
					},
					after: async (user, ctx) => {
						const { kind } = user as { kind?: string };
						if (!hooks.onMemberCreated || kind === "agent") {
							return;
						}
						try {
							await hooks.onMemberCreated(
								{ id: user.id, email: user.email, name: user.name },
								ctx?.headers?.get("accept-language") ?? null,
							);
						} catch {
							// A notification must never undo or block a sign-in.
						}
					},
				},
			},
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		advanced: {
			// One origin per deployment (map #86): the web and the API share a site, so the session
			// cookie is first-party. With the back-office on its own host (COOKIE_DOMAIN), the cookie is
			// scoped to the parent domain so both hosts see the same session.
			crossSubDomainCookies: env.COOKIE_DOMAIN
				? { enabled: true, domain: env.COOKIE_DOMAIN }
				: undefined,
			defaultCookieAttributes: {
				sameSite: "lax",
				secure: true,
				httpOnly: true,
			},
		},
		user: {
			additionalFields: {
				// "human" | "agent"; set server-side only, never by the client.
				kind: {
					type: ["human", "agent"],
					required: false,
					defaultValue: "human",
					input: false,
				},
				// For agents: the human Member who owns and answers for them.
				ownerId: { type: "string", required: false, input: false },
				// Set by an Admin suspension (#123): read by the API context, never by the client.
				suspendedAt: { type: "date", required: false, input: false },
				// Also declared by the admin plugin below; restated here with the enum's values so the
				// Session type carries the exact roles. Seeded from the staff email lists, then managed
				// through the audited staff procedures of the API (#285), never by the client.
				role: {
					type: [...ROLES],
					required: false,
					defaultValue: DEFAULT_ROLE,
					input: false,
				},
			},
		},
		plugins: [
			...(proxy ? [oAuthProxy(proxy)] : []),
			// Role management and access control (#120, #285). The roles and what each may do live in
			// ./access; the plugin's own set-role, ban and impersonate endpoints are granted to none: role
			// changes go through the audited staff procedures of the API.
			admin({
				ac,
				roles,
				defaultRole: DEFAULT_ROLE,
				adminRoles: [...STAFF_ROLES],
			}),
			...(env.EMAIL_OTP_SIGNIN && hooks.sendSignInOtp
				? [
						emailOTP({
							otpLength: 6,
							expiresIn: 300,
							// Awaited so a failed delivery surfaces as an error instead of a silent wait.
							async sendVerificationOTP({ email, otp, type }, ctx) {
								if (type !== "sign-in") {
									return;
								}
								await hooks.sendSignInOtp?.(
									email,
									otp,
									ctx?.headers?.get("accept-language") ?? null,
								);
							},
						}),
					]
				: []),
			apiKey({
				enableSessionForAPIKeys: true,
				// Accept the key as `x-api-key` (default) or `Authorization: Bearer <key>` (MCP clients).
				customAPIKeyGetter: (ctx) => {
					const direct = ctx.headers?.get("x-api-key");
					if (direct) {
						return direct;
					}
					const authorization = ctx.headers?.get("authorization");
					return authorization?.startsWith("Bearer ")
						? authorization.slice(7)
						: null;
				},
				rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 120 },
			}),
		],
	});
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
