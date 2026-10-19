import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./organizations";

// Hackathon (spec §2): informational only, the MVP lists the CADEV 2026. Seeded with its
// starting values, then edited by an Admin; `version` guards concurrent edits (CONFLICT).
export const hackathon = pgTable("hackathon", {
	id: uuid("id").defaultRandom().primaryKey(),
	slug: text("slug").notNull().unique(),
	name: text("name").notNull(),
	// The Organization that lists it (#257), replacing the former free-text organizer.
	organizationId: uuid("organization_id")
		.notNull()
		.references(() => organization.id),
	summary: text("summary").notNull(),
	// When the Hackathon opens (#261): a repository whose first commit is older is flagged.
	opensAt: timestamp("opens_at"),
	// Teams and submissions are run on CodeSphere (#261). Off for an event whose registration and
	// submission live elsewhere (the CADEV: Systalink's Datacloud): the page then points to `sourceUrl`.
	teamsEnabled: boolean("teams_enabled").default(true).notNull(),
	teamMin: integer("team_min").notNull(),
	teamMax: integer("team_max").notNull(),
	sourceUrl: text("source_url").notNull(),
	// Where non-public information came from, e.g. a calendar sent by the organisers.
	sourceNote: text("source_note"),
	verifiedAt: timestamp("verified_at").notNull(),
	version: integer("version").default(1).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

/** A dated step of a Hackathon's timeline, shown with a countdown in the viewer's timezone. */
export const hackathonMilestone = pgTable(
	"hackathon_milestone",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		hackathonId: uuid("hackathon_id")
			.notNull()
			.references(() => hackathon.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		label: text("label").notNull(),
		startsAt: timestamp("starts_at").notNull(),
		endsAt: timestamp("ends_at"),
		position: integer("position").notNull(),
	},
	(table) => [
		unique("hackathon_milestone_key_unique").on(table.hackathonId, table.key),
		index("hackathon_milestone_hackathon_idx").on(table.hackathonId),
	],
);

export const hackathonPrize = pgTable(
	"hackathon_prize",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		hackathonId: uuid("hackathon_id")
			.notNull()
			.references(() => hackathon.id, { onDelete: "cascade" }),
		label: text("label").notNull(),
		amount: text("amount"),
		conditions: text("conditions"),
		position: integer("position").notNull(),
	},
	(table) => [index("hackathon_prize_hackathon_idx").on(table.hackathonId)],
);

/** A weighted criterion the Hackathon is judged on, scored by the jury, the public or peers. */
export const hackathonCriterion = pgTable(
	"hackathon_criterion",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		hackathonId: uuid("hackathon_id")
			.notNull()
			.references(() => hackathon.id, { onDelete: "cascade" }),
		label: text("label").notNull(),
		weight: integer("weight").notNull(),
		scoredBy: text("scored_by").notNull(),
		position: integer("position").notNull(),
	},
	(table) => [index("hackathon_criterion_hackathon_idx").on(table.hackathonId)],
);
