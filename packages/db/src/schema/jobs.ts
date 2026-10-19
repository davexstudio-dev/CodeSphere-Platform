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
import { organization } from "./organizations";

// Job postings and the Talent card (#258, decision #227). A posting belongs to a validated
// Organization, lasts 30 days and asks nothing of the candidate. The Talent card is the Member's own
// optional profile for recruiters, off by default.

export const JOB_STATUSES = ["published", "removed"] as const;
export const JOB_DURATION_DAYS = 30;

export const jobPostings = pgTable(
	"job_postings",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organization.id),
		// The Member who published it, for the Organization.
		createdBy: text("created_by")
			.notNull()
			.references(() => user.id),
		title: text("title").notNull(),
		description: text("description").notNull(),
		tags: text("tags").array().default([]).notNull(),
		// ISO 3166-1 alpha-2, or OTHER.
		country: text("country").notNull(),
		remote: boolean("remote").default(false).notNull(),
		// Where to apply, outside CodeSphere: a link, or an email (exactly one is set).
		applyUrl: text("apply_url"),
		applyEmail: text("apply_email"),
		status: text("status", { enum: JOB_STATUSES }).default("published").notNull(),
		removedReason: text("removed_reason"),
		publishedAt: timestamp("published_at", { precision: 3 }).defaultNow().notNull(),
		// publishedAt + 30 days: after it the posting is no longer listed.
		expiresAt: timestamp("expires_at", { precision: 3 }).notNull(),
		version: integer("version").default(1).notNull(),
	},
	(t) => [
		index("job_postings_listing_idx").on(t.status, t.expiresAt, t.publishedAt),
		index("job_postings_org_idx").on(t.organizationId),
	],
);

export const jobReports = pgTable(
	"job_reports",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		jobId: uuid("job_id")
			.notNull()
			.references(() => jobPostings.id, { onDelete: "cascade" }),
		reason: text("reason").notNull(),
		// Null while waiting for an Admin; `upheld` when the report was founded.
		outcome: text("outcome", { enum: ["upheld", "dismissed"] }),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.jobId] })],
);

// A Member's optional profile for recruiters. Reputation, strongest Tags and country are read live
// from the Member's own activity; only the choices below are stored.
export const talentCards = pgTable("talent_cards", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	// Visible to validated Organizations that opened a posting the Member applied to with it.
	// Off by default: nothing is shown until the Member turns it on or applies with it.
	enabled: boolean("enabled").default(false).notNull(),
	// « Ouvert aux contacts »: listed in the directory validated Organizations can read.
	openToContact: boolean("open_to_contact").default(false).notNull(),
	headline: text("headline"),
	codeUrl: text("code_url"),
	contactEmail: text("contact_email"),
	updatedAt: timestamp("updated_at", { precision: 3 }).defaultNow().notNull(),
});

// « Postuler avec ma fiche CodeSphere »: the Member tells an Organization they applied, and may
// share their Talent card for this posting only.
export const jobApplications = pgTable(
	"job_applications",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		jobId: uuid("job_id")
			.notNull()
			.references(() => jobPostings.id, { onDelete: "cascade" }),
		sharedCard: boolean("shared_card").default(false).notNull(),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.jobId] })],
);
