import {
	boolean,
	index,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export type SocialPostState =
	| "pending"
	| "published"
	| "processing"
	| "failed"
	| "unknown";

// What an Admin publishes to CodeSphere's own social accounts (#265, ADR 0001). One row per
// content and platform: `idempotencyKey` (`share:{type}:{id}:{platform}`) is unique, so a retry
// never publishes twice. `pending` and `unknown` are never re-sent blindly: the platform may
// already hold the post. Only a `failed` row marked `retryable` is claimed again.
export const socialPost = pgTable(
	"social_post",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		idempotencyKey: text("idempotency_key").notNull().unique(),
		targetType: text("target_type").$type<"question" | "hackathon">().notNull(),
		// A Question's id or a Hackathon's slug.
		targetId: text("target_id").notNull(),
		platform: text("platform").$type<"bluesky">().notNull(),
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
