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

// An Organization (#257, decision #227): a company, university, startup or community validated by an
// Admin. Never a Member: a Member applies on its behalf and owns the request. Once validated it can
// be the organizer of Hackathons (and, later, publish Job postings).
export const ORGANIZATION_STATUSES = [
	"pending",
	"validated",
	"rejected",
	"suspended",
] as const;

export const organization = pgTable(
	"organization",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		// Public address of its profile: /organizations/<slug>.
		slug: text("slug").notNull().unique(),
		name: text("name").notNull(),
		website: text("website").notNull(),
		description: text("description").notNull().default(""),
		// ISO 3166-1 alpha-2, or OTHER.
		country: text("country").notNull(),
		// An email on the Organization's own domain; never public. Null for those the platform
		// created itself (the CADEV's organizer, migrated from the old free-text field).
		contactEmail: text("contact_email"),
		status: text("status", { enum: ORGANIZATION_STATUSES })
			.default("pending")
			.notNull(),
		// Why it was rejected or suspended; shown to the owner.
		statusReason: text("status_reason"),
		// The Member who applied; null for an Organization the platform created.
		ownerId: text("owner_id").references(() => user.id),
		reviewedBy: text("reviewed_by").references(() => user.id),
		reviewedAt: timestamp("reviewed_at", { precision: 3 }),
		// When it was first validated: kept through a suspension and a reinstatement.
		validatedAt: timestamp("validated_at", { precision: 3 }),
		// Guards concurrent Admin decisions (CONFLICT).
		version: integer("version").default(1).notNull(),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
		// Created by the platform rather than requested (migrated or seeded).
		system: boolean("system").default(false).notNull(),
	},
	(t) => [
		index("organization_status_idx").on(t.status),
		index("organization_owner_idx").on(t.ownerId),
	],
);
