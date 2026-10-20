import {
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/** `from`/`to`: the roles of a role change (#285), never a personal value. */
export type AuditDetails = {
	fields?: string[];
	reason?: string;
	from?: string;
	to?: string;
};

// Admin audit log (spec §2): one row per sensitive admin action. Written by admin
// procedures, read back for the audit view. `actorId` is nullable so a log entry survives
// the deletion of the actor's account.
export const auditLog = pgTable(
	"audit_log",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		actorId: text("actor_id").references(() => user.id, {
			onDelete: "set null",
		}),
		action: text("action").notNull(),
		targetType: text("target_type").notNull(),
		targetId: text("target_id"),
		// Names of the fields that changed and, for a suspension, the reason: never personal
		// values (#116). Read by the audit screen only.
		details: jsonb("details").$type<AuditDetails>(),
		// Millisecond precision: the list cursor carries a JS Date, which holds no microseconds (#122).
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
	},
	(table) => [
		index("audit_log_actor_idx").on(table.actorId),
		index("audit_log_created_idx").on(table.createdAt),
	],
);
