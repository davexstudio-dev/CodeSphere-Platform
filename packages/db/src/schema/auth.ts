import { DEFAULT_ROLE, ROLES } from "@codesphere/contract/roles";
import { defineRelationsPart } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

// The roles an account can hold: a Postgres enum fed by the contract's list, so the database
// refuses any other value. Adding a role is a new migration (ALTER TYPE … ADD VALUE).
export const userRole = pgEnum("user_role", ROLES);

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	kind: text("kind").default("human").notNull(),
	ownerId: text("owner_id"),
	// Re-derived from the staff email lists at every sign-in (spec §2, #120).
	role: userRole("role").default(DEFAULT_ROLE).notNull(),
	// Columns of Better Auth's admin plugin. Unused: suspension is ours (suspendedAt below, with
	// its audit trail), and no role may ban.
	banned: boolean("banned").default(false),
	banReason: text("ban_reason"),
	banExpires: timestamp("ban_expires"),
	// Moderation (#123): a suspended Member keeps reading but every write is refused and their
	// API keys stop being accepted. Set by `admin.members.suspend`, never by the Member.
	suspendedAt: timestamp("suspended_at", { precision: 3 }),
	suspensionReason: text("suspension_reason"),
	// Language of the emails (#337): fr or en. Filled at the first sign-in from Accept-Language, then edited in the settings. Null until then.
	locale: text("locale", { enum: ["fr", "en"] }),
	// Region (spec §2): public country (ISO alpha-2 or OTHER); the city stays private by default.
	country: text("country"),
	city: text("city"),
	// The city is shown to others only when the member makes it public (spec §2).
	cityPublic: boolean("city_public").default(false).notNull(),
	// Preference: hide the content written by agents (spec §2).
	hideAgentContent: boolean("hide_agent_content").default(false).notNull(),
	// The Member skipped the Tags onboarding (#44): set once, so the step is not offered again on any
	// device. Following a Tag does not need it; it only silences the automatic redirect.
	tagsOnboardingSkippedAt: timestamp("tags_onboarding_skipped_at"),
	// Consent recorded at the first SSO sign-in (spec §4): version and date, never a bare flag.
	consentVersion: text("consent_version"),
	consentAcceptedAt: timestamp("consent_accepted_at"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const session = pgTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: timestamp("expires_at").notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// Column of Better Auth's admin plugin (impersonation): never set, no role may impersonate.
		impersonatedBy: text("impersonated_by"),
	},
	(table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const authRelations = defineRelationsPart(
	{ user, session, account, verification },
	(r) => ({
		user: {
			sessions: r.many.session({
				from: r.user.id,
				to: r.session.userId,
			}),
			accounts: r.many.account({
				from: r.user.id,
				to: r.account.userId,
			}),
		},
		session: {
			user: r.one.user({
				from: r.session.userId,
				to: r.user.id,
			}),
		},
		account: {
			user: r.one.user({
				from: r.account.userId,
				to: r.user.id,
			}),
		},
	}),
);

export const apikey = pgTable(
	"apikey",
	{
		id: text("id").primaryKey(),
		configId: text("config_id").default("default").notNull(),
		name: text("name"),
		start: text("start"),
		referenceId: text("reference_id").notNull(),
		prefix: text("prefix"),
		key: text("key").notNull(),
		refillInterval: integer("refill_interval"),
		refillAmount: integer("refill_amount"),
		lastRefillAt: timestamp("last_refill_at"),
		enabled: boolean("enabled").default(true),
		rateLimitEnabled: boolean("rate_limit_enabled").default(true),
		rateLimitTimeWindow: integer("rate_limit_time_window"),
		rateLimitMax: integer("rate_limit_max"),
		requestCount: integer("request_count").default(0),
		remaining: integer("remaining"),
		lastRequest: timestamp("last_request"),
		expiresAt: timestamp("expires_at"),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
		permissions: text("permissions"),
		metadata: text("metadata"),
	},
	(table) => [
		index("apikey_configId_idx").on(table.configId),
		index("apikey_referenceId_idx").on(table.referenceId),
		index("apikey_key_idx").on(table.key),
	],
);
