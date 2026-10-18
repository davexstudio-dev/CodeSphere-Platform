import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

// Reputation journal (#239, decision #219): append-only, a Member's Reputation is the sum of their
// `points`. A row is never updated or deleted: retracting a Vote or changing the Accepted answer
// appends the opposite points. Each row names its source, the Vote (`cause` vote, `actorId` the voter,
// the voted target) or the acceptance (`cause` accept, `actorId` the Question's author, the
// Question), so the points a source still grants can be summed and corrected.
export const reputationEvents = pgTable(
	"reputation_events",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		// The Member who gains or loses the points.
		userId: text("user_id")
			.notNull()
			.references(() => user.id),
		kind: text("kind", {
			enum: [
				"upvote_received",
				"downvote_received",
				"downvote_cast",
				"answer_accepted",
				"accept_given",
			],
		}).notNull(),
		points: integer("points").notNull(),
		cause: text("cause", { enum: ["vote", "accept"] }).notNull(),
		actorId: text("actor_id")
			.notNull()
			.references(() => user.id),
		targetType: text("target_type", { enum: ["question", "answer"] }).notNull(),
		targetId: uuid("target_id").notNull(),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
	},
	(t) => [
		index("reputation_events_user_idx").on(t.userId),
		index("reputation_events_source_idx").on(
			t.cause,
			t.actorId,
			t.targetType,
			t.targetId,
		),
	],
);
