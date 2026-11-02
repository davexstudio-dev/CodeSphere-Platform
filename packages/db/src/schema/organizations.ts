import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
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

// The people who work on an Organization's Hackathons (#326). The Organization's owner
// (`organization.owner_id`) is its manager and is not listed here; every row here is an editor.
// Rights are two roles only: the manager runs members and the profile, an editor runs Hackathons.
export const organizationMember = pgTable(
	"organization_member",
	{
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.organizationId, t.userId] }),
		index("organization_member_user_idx").on(t.userId),
	],
);

export const ORGANIZATION_INVITATION_ROLES = ["editor", "owner"] as const;
export const ORGANIZATION_INVITATION_STATUSES = [
	"pending",
	"accepted",
	"declined",
	"cancelled",
] as const;

// An invitation the invitee must accept. `editor` adds a Member; `owner` hands the management over
// to a Member who is already an editor.
export const organizationInvitation = pgTable(
	"organization_invitation",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		inviteeId: text("invitee_id")
			.notNull()
			.references(() => user.id),
		invitedBy: text("invited_by")
			.notNull()
			.references(() => user.id),
		role: text("role", { enum: ORGANIZATION_INVITATION_ROLES })
			.default("editor")
			.notNull(),
		status: text("status", { enum: ORGANIZATION_INVITATION_STATUSES })
			.default("pending")
			.notNull(),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
		decidedAt: timestamp("decided_at", { precision: 3 }),
	},
	(t) => [
		// One open invitation per Member and Organization.
		uniqueIndex("organization_invitation_open_idx")
			.on(t.organizationId, t.inviteeId)
			.where(sql`${t.status} = 'pending'`),
		index("organization_invitation_invitee_idx").on(t.inviteeId),
	],
);
