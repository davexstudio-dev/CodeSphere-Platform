import { sql } from "drizzle-orm";
import {
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { user, userRole } from "./auth";

/** How long an invitation can be accepted: seven days (#286). */
export const STAFF_INVITATION_DAYS = 7;

// An Admin's offer of a staff role to an email address (#286). It creates no account and no
// password: the role is applied when that verified email first signs in (a Better Auth hook), or
// at once when the email already belongs to a Member. The email is stored lowercased, and is the
// only personal value here: it never reaches the audit log, which carries the invitation's id.
export const staffInvitation = pgTable(
	"staff_invitation",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		email: text("email").notNull(),
		role: userRole("role").notNull(),
		invitedBy: text("invited_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
		expiresAt: timestamp("expires_at", { precision: 3 }).notNull(),
		revokedAt: timestamp("revoked_at", { precision: 3 }),
		acceptedAt: timestamp("accepted_at", { precision: 3 }),
	},
	(table) => [
		// One open offer per email: inviting again replaces it instead of piling up.
		uniqueIndex("staff_invitation_open_email_idx")
			.on(table.email)
			.where(sql`${table.acceptedAt} IS NULL AND ${table.revokedAt} IS NULL`),
		index("staff_invitation_created_idx").on(table.createdAt),
	],
);
