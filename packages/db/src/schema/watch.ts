import {
	boolean,
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

// The watch feed (#255, decisions #223 and #226). Only links, titles and short summaries are
// kept: never a copied article body or image.

// The whitelist of trusted Sources an Admin manages: their items are visible at once.
export const watchSources = pgTable("watch_sources", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: text("name").notNull(),
	// RSS or Atom feed read by the scheduled task.
	feedUrl: text("feed_url").notNull().unique(),
	// The Source's own domain, kept so a removal on request can block it.
	domain: text("domain").notNull(),
	language: text("language", { enum: ["fr", "en"] }).notNull(),
	// "African source" flag shown on the card.
	african: boolean("african").default(false).notNull(),
	// Tags given to every item the Source brings.
	tags: text("tags").array().default([]).notNull(),
	active: boolean("active").default(true).notNull(),
	version: integer("version").default(1).notNull(),
	lastFetchedAt: timestamp("last_fetched_at", { precision: 3 }),
	lastError: text("last_error"),
	createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
});

export const watchBlockedDomains = pgTable("watch_blocked_domains", {
	domain: text("domain").primaryKey(),
	reason: text("reason"),
	createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
});

export const WATCH_VISIBILITIES = ["visible", "pending", "removed"] as const;

export const watchItems = pgTable(
	"watch_items",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		url: text("url").notNull(),
		// Normalized link: one item per key.
		urlKey: text("url_key").notNull().unique(),
		domain: text("domain").notNull(),
		title: text("title").notNull(),
		// 300 characters at most, plain text.
		summary: text("summary").notNull(),
		tags: text("tags").array().default([]).notNull(),
		language: text("language", { enum: ["fr", "en"] }).notNull(),
		africanSource: boolean("african_source").default(false).notNull(),
		// A Source's item, or a Member's or Agent's proposal (exactly one of the two is set).
		sourceId: uuid("source_id").references(() => watchSources.id),
		submitterId: text("submitter_id").references(() => user.id),
		visibility: text("visibility", { enum: WATCH_VISIBILITIES })
			.default("pending")
			.notNull(),
		removedReason: text("removed_reason"),
		publishedAt: timestamp("published_at", { precision: 3 }).notNull(),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
	},
	(t) => [
		index("watch_items_listing_idx").on(t.visibility, t.publishedAt, t.id),
		index("watch_items_source_idx").on(t.sourceId),
		index("watch_items_domain_idx").on(t.domain),
	],
);

export const watchItemVotes = pgTable(
	"watch_item_votes",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		itemId: uuid("item_id")
			.notNull()
			.references(() => watchItems.id, { onDelete: "cascade" }),
		value: integer("value").notNull(),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.itemId] })],
);

// "Garder pour plus tard".
export const watchItemSaves = pgTable(
	"watch_item_saves",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		itemId: uuid("item_id")
			.notNull()
			.references(() => watchItems.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.itemId] })],
);

export const watchItemReports = pgTable(
	"watch_item_reports",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		itemId: uuid("item_id")
			.notNull()
			.references(() => watchItems.id, { onDelete: "cascade" }),
		reason: text("reason").notNull(),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.itemId] })],
);
