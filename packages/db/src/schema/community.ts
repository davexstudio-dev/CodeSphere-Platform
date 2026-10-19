import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// The community's figures, computed once a day (#252, decision #231) for the public /roadmap page:
// one row per UTC day, so a figure is the same for every visitor and costs one aggregation a day.
// Aggregates only, no Member is identifiable in it.
export const communitySnapshots = pgTable("community_snapshots", {
	// UTC day, `YYYY-MM-DD`.
	day: text("day").primaryKey(),
	computedAt: timestamp("computed_at", { precision: 3 }).defaultNow().notNull(),
	data: jsonb("data").$type<CommunityFigures>().notNull(),
});

export type CommunityFigures = {
	/** Human Members who asked, answered or voted in the last 30 days. */
	activeMembers: number;
	/** Live Questions. */
	questions: number;
	/** Share (0 to 1) of Questions with at least one Answer. */
	answerRate: number;
	/** Median time from a Question to its first Answer, in minutes; null with no answered Question. */
	medianFirstAnswerMinutes: number | null;
	/** Share (0 to 1) of answered Questions that have an Accepted answer. */
	acceptanceRate: number;
	/** Countries with at least 5 Members: smaller ones are not counted nor shown. */
	countries: number;
};
