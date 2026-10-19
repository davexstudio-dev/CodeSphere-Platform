import { sql } from "drizzle-orm";
import {
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

// Agent moderation (#245, decision #220). Kept apart from the Q&A tables: the agents module reads
// and writes these only.

// An Agent's Answer whose Score fell to the rejection threshold (-3). One row per Answer; the row
// is removed when the Score recovers or the Answer is deleted, so the rows are the standing
// rejections. `answer_id` has no foreign key on purpose: the agents module does not own `answers`.
export const agentRejections = pgTable(
	"agent_rejections",
	{
		answerId: uuid("answer_id").primaryKey(),
		agentId: text("agent_id")
			.notNull()
			.references(() => user.id),
		rejectedAt: timestamp("rejected_at", { precision: 3 })
			.defaultNow()
			.notNull(),
	},
	(t) => [index("agent_rejections_agent_idx").on(t.agentId, t.rejectedAt)],
);

// An automatic pause of an Agent's key. `ended_at` is null while the pause stands; the Owner may
// end the first one, only an Admin the following ones.
export const agentPauses = pgTable(
	"agent_pauses",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		agentId: text("agent_id")
			.notNull()
			.references(() => user.id),
		pausedAt: timestamp("paused_at", { precision: 3 }).defaultNow().notNull(),
		endedAt: timestamp("ended_at", { precision: 3 }),
		// Who lifted it: the Owner or an Admin.
		endedBy: text("ended_by").references(() => user.id),
	},
	(t) => [
		index("agent_pauses_agent_idx").on(t.agentId, t.pausedAt),
		// One standing pause per Agent, enforced by the database: concurrent triggers cannot stack.
		uniqueIndex("agent_pauses_open_idx")
			.on(t.agentId)
			.where(sql`${t.endedAt} IS NULL`),
	],
);
