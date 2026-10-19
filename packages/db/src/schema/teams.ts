import {
	boolean,
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { hackathon } from "./hackathons";

// Teams and Submissions of an open Hackathon (#261, decision #228). A Member belongs to one Team per
// Hackathon: the database enforces it, so two requests at once cannot put a Member in two Teams.

export const hackathonTeams = pgTable(
	"hackathon_teams",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		hackathonId: uuid("hackathon_id")
			.notNull()
			.references(() => hackathon.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		captainId: text("captain_id")
			.notNull()
			.references(() => user.id),
		// Whoever has the link joins (while there is room and registration is open); the captain can
		// replace it, which kills the old one.
		inviteToken: text("invite_token").notNull().unique(),
		// Kept in step with the members by atomic updates: joining is `member_count < max`, in one
		// statement, so two joins at once cannot overfill a Team.
		memberCount: integer("member_count").default(1).notNull(),
		version: integer("version").default(1).notNull(),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
	},
	(t) => [
		unique("hackathon_teams_name").on(t.hackathonId, t.name),
		index("hackathon_teams_hackathon_idx").on(t.hackathonId),
	],
);

export const hackathonTeamMembers = pgTable(
	"hackathon_team_members",
	{
		teamId: uuid("team_id")
			.notNull()
			.references(() => hackathonTeams.id, { onDelete: "cascade" }),
		// Repeated from the Team so that one Member is in one Team per Hackathon, by constraint.
		hackathonId: uuid("hackathon_id")
			.notNull()
			.references(() => hackathon.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id),
		joinedAt: timestamp("joined_at", { precision: 3 }).defaultNow().notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.teamId, t.userId] }),
		unique("hackathon_team_members_one_team").on(t.hackathonId, t.userId),
	],
);

// An invitation by name: the invited Member accepts or declines.
export const hackathonTeamInvites = pgTable(
	"hackathon_team_invites",
	{
		teamId: uuid("team_id")
			.notNull()
			.references(() => hackathonTeams.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id),
		invitedBy: text("invited_by")
			.notNull()
			.references(() => user.id),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

// A Team's project: links only, no uploaded files. Editable until the submission deadline.
export const hackathonSubmissions = pgTable("hackathon_submissions", {
	id: uuid("id").defaultRandom().primaryKey(),
	teamId: uuid("team_id")
		.notNull()
		.unique()
		.references(() => hackathonTeams.id, { onDelete: "cascade" }),
	hackathonId: uuid("hackathon_id")
		.notNull()
		.references(() => hackathon.id, { onDelete: "cascade" }),
	title: text("title").notNull(),
	description: text("description").notNull(),
	descriptionHtml: text("description_html").notNull(),
	repoUrl: text("repo_url").notNull(),
	demoUrl: text("demo_url").notNull(),
	videoUrl: text("video_url"),
	tags: text("tags").array().default([]).notNull(),
	// The first commit of the repository is older than the Hackathon's opening: an Admin looks.
	earlyCommitFlag: boolean("early_commit_flag").default(false).notNull(),
	earlyCommitAt: timestamp("early_commit_at", { precision: 3 }),
	checkedAt: timestamp("checked_at", { precision: 3 }),
	version: integer("version").default(1).notNull(),
	createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { precision: 3 }).defaultNow().notNull(),
});
