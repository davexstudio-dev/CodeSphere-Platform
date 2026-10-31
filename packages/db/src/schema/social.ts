import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export type SocialPostState =
	| "pending"
	| "sending"
	| "published"
	| "processing"
	| "failed"
	| "unknown";

// What an Admin publishes to CodeSphere's own social accounts (#265, ADR 0001). One row per
// content and platform: `idempotencyKey` (`share:{type}:{id}:{platform}`) is unique, so a retry
// never publishes twice. `pending` waits for the outbox's consumer, which moves it to `sending`
// before anything leaves. `sending` and `unknown` are never re-sent blindly: the platform may
// already hold the post. Only a `failed` row marked `retryable` is claimed again.
export const socialPost = pgTable(
	"social_post",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		idempotencyKey: text("idempotency_key").notNull().unique(),
		targetType: text("target_type").$type<"question" | "hackathon">().notNull(),
		// A Question's id or a Hackathon's slug.
		targetId: text("target_id").notNull(),
		platform: text("platform").$type<"bluesky" | "linkedin" | "x">().notNull(),
		state: text("state").$type<SocialPostState>().notNull(),
		text: text("text").notNull(),
		// Public URL of the post once published.
		postUrl: text("post_url"),
		message: text("message"),
		retryable: boolean("retryable").default(false).notNull(),
		requestedBy: text("requested_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { precision: 3 }).defaultNow().notNull(),
	},
	(table) => [
		index("social_post_target_idx").on(table.targetType, table.targetId),
	],
);

export type SocialCredentialStatus = "connected" | "reconnect-required";

// The tokens of CodeSphere's official X and LinkedIn accounts (#266, ADR 0001). `sealed` is the
// AES-GCM encrypted credential: nothing readable lives here besides the account's public name.
// `revision` is the compare-and-set counter: a renewal saves only if nobody changed the row
// since it read it.
export const socialCredential = pgTable("social_credential", {
	platform: text("platform").$type<"linkedin" | "x">().primaryKey(),
	sealed: text("sealed").notNull(),
	revision: integer("revision").default(1).notNull(),
	accountId: text("account_id").notNull(),
	accountName: text("account_name").notNull(),
	// When the access token expires; null when the platform gives none.
	expiresAt: timestamp("expires_at", { precision: 3 }),
	status: text("status")
		.$type<SocialCredentialStatus>()
		.default("connected")
		.notNull(),
	connectedBy: text("connected_by").references(() => user.id, {
		onDelete: "set null",
	}),
	connectedAt: timestamp("connected_at", { precision: 3 })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { precision: 3 }).defaultNow().notNull(),
});

// One renewal at a time per platform: a lease that expires by itself if its holder dies.
export const socialCredentialLock = pgTable("social_credential_lock", {
	key: text("key").primaryKey(),
	token: text("token").notNull(),
	expiresAt: timestamp("expires_at", { precision: 3 }).notNull(),
});

// An OAuth authorization in progress: the `state` is the callback's single-use proof, the PKCE
// verifier is sealed, and only the Admin who started it may finish it.
export const socialConnectAttempt = pgTable("social_connect_attempt", {
	state: text("state").primaryKey(),
	platform: text("platform").$type<"linkedin" | "x">().notNull(),
	sealedVerifier: text("sealed_verifier").notNull(),
	requestedBy: text("requested_by")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	expiresAt: timestamp("expires_at", { precision: 3 }).notNull(),
	createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
});
