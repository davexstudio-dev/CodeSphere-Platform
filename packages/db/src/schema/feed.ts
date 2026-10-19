import {
	boolean,
	pgTable,
	primaryKey,
	real,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

// The Member's personalisation of the « Pour toi » feed (#256, decision #226). The whole profile is
// part of the data export and is deleted with the account. It is aggregate weights and explicit
// choices, never a log of what the Member viewed.

export const feedPreferences = pgTable("feed_preferences", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	// Off: the feed is the hot score on the followed Tags only, with no bonus, no learned affinity.
	personalization: boolean("personalization").default(true).notNull(),
	// Language favoured by the feed; null follows the interface language.
	language: text("language", { enum: ["fr", "en"] }),
	updatedAt: timestamp("updated_at", { precision: 3 }).defaultNow().notNull(),
});

// « Moins comme ça »: a Tag or a Source the Member does not want to see.
export const feedMuted = pgTable(
	"feed_muted",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		kind: text("kind", { enum: ["tag", "source"] }).notNull(),
		// The Tag name, or the Source's key (its id, or the domain of a proposal).
		key: text("key").notNull(),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.kind, t.key] })],
);

// What the Member's own actions (an upvote, keeping an item) taught the feed about their interests:
// one capped weight per Tag.
export const feedAffinity = pgTable(
	"feed_affinity",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		tag: text("tag").notNull(),
		weight: real("weight").default(0).notNull(),
		updatedAt: timestamp("updated_at", { precision: 3 }).defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.tag] })],
);

export const FEED_AFFINITY_MAX = 10;
export type FeedAffinityRow = typeof feedAffinity.$inferSelect;
