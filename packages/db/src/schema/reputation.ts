import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

// Reputation journal (#239, decision #219): append-only, a Member's Reputation is the sum of the
// `points` of the rows that are not voided (every sum must exclude `voided_reason IS NOT NULL`, see
// read.ts). A row is never updated or deleted: retracting a Vote or changing the Accepted answer
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
		// Anti-farming (#241): a row the rules cancelled stays in the journal with the reason, and
		// its points count for nothing. `new_account`: the voter's account was under 7 days old;
		// `repeat_voter`: the same voter already gave this Member too many votes in 30 days (also
		// reported to the Admins); `daily_cap`: the part above the +200 a Member can gain per day.
		voidedReason: text("voided_reason", {
			enum: ["new_account", "repeat_voter", "daily_cap"],
		}),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
	},
	(t) => [
		index("reputation_events_voided_idx").on(t.voidedReason, t.createdAt, t.id),
		index("reputation_events_user_idx").on(t.userId),
		index("reputation_events_source_idx").on(
			t.cause,
			t.actorId,
			t.targetType,
			t.targetId,
		),
	],
);
