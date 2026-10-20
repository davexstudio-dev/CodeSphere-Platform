import { canChangeRole, type Role, staffRank } from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import { session, user } from "@codesphere/db/schema/auth";
import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { adminMember } from "./admin-members";
import { withAudit } from "./audit";

export type StaffActor = { id: string; role: string };

export type StaffOutcome =
	| { ok: true; member: ReturnType<typeof adminMember> }
	| {
			ok: false;
			code: "NOT_FOUND" | "FORBIDDEN" | "CONFLICT";
			message?: string;
	  };

const isListedSuperAdmin = (
	row: { email: string; emailVerified: boolean },
	listed: ReadonlySet<string> | undefined,
) => row.emailVerified && Boolean(listed?.has(row.email.trim().toLowerCase()));

// Revokes every session of the mutated row: a step of withAudit, so it lands with the change.
const revokeSessionsOf = () =>
	sql`DELETE FROM ${session} WHERE ${session.userId} IN (SELECT id FROM m)`;

/**
 * Gives a Member a new role (#285), audited as `member.set_role` with the old and new role. The
 * rules (canChangeRole): a super_admin gives any role, an admin up to admin and only to roles below
 * theirs. Two guards keep the staff from locking itself out: a SUPER_ADMIN_EMAILS member is never
 * demoted (the next sign-in would undo it), nor is the last active super_admin. A demotion revokes
 * the Member's sessions in the same statement, so the lost access is immediate.
 */
export async function setRole(
	db: Database,
	actor: StaffActor,
	targetId: string,
	next: Role,
	reason: string,
	superAdminEmails?: ReadonlySet<string>,
): Promise<StaffOutcome> {
	const [row] = await db.select().from(user).where(eq(user.id, targetId));
	if (!row || row.kind === "agent") {
		return { ok: false, code: "NOT_FOUND" };
	}
	if (row.id === actor.id) {
		return {
			ok: false,
			code: "FORBIDDEN",
			message: "A staff member cannot change their own role.",
		};
	}
	if (!canChangeRole(actor.role, row.role, next)) {
		return {
			ok: false,
			code: row.role === next ? "CONFLICT" : "FORBIDDEN",
			message:
				row.role === next
					? undefined
					: "You cannot give this role to this Member.",
		};
	}
	if (row.role === "super_admin") {
		if (isListedSuperAdmin(row, superAdminEmails)) {
			return {
				ok: false,
				code: "CONFLICT",
				message: "This super admin is set by the environment.",
			};
		}
		const [others] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(user)
			.where(
				and(
					eq(user.role, "super_admin"),
					isNull(user.suspendedAt),
					ne(user.id, row.id),
				),
			);
		if (!others || others.count === 0) {
			return {
				ok: false,
				code: "CONFLICT",
				message: "The last super admin cannot be demoted.",
			};
		}
	}
	const demotion = staffRank(next) < staffRank(row.role);
	const changed = await withAudit(
		db,
		{
			actorId: actor.id,
			action: "member.set_role",
			targetType: "member",
			targetIdColumn: "id",
			details: { from: row.role, to: next, reason },
		},
		db
			.update(user)
			// Guarded on the role read above: a concurrent change makes this match nothing.
			.set({ role: next })
			.where(and(eq(user.id, row.id), eq(user.role, row.role)))
			.returning({ id: user.id }),
		demotion ? [revokeSessionsOf()] : [],
	);
	if (changed.length === 0) {
		return { ok: false, code: "CONFLICT" };
	}
	return { ok: true, member: adminMember({ ...row, role: next }) };
}

/**
 * Signs a staff member out everywhere (#285), audited as `member.revoke_sessions`. Rank rules as for
 * a role change: only a role strictly below the actor's, never oneself (the "Mon compte" screen has
 * its own way to end one's other sessions).
 */
export async function revokeStaffSessions(
	db: Database,
	actor: StaffActor,
	targetId: string,
): Promise<StaffOutcome> {
	const [row] = await db.select().from(user).where(eq(user.id, targetId));
	if (!row || row.kind === "agent") {
		return { ok: false, code: "NOT_FOUND" };
	}
	if (row.id === actor.id || staffRank(actor.role) <= staffRank(row.role)) {
		return {
			ok: false,
			code: "FORBIDDEN",
			message: "You cannot sign out a Member of equal or higher rank.",
		};
	}
	await withAudit(
		db,
		{
			actorId: actor.id,
			action: "member.revoke_sessions",
			targetType: "member",
			targetIdColumn: "id",
		},
		// A no-op update gives withAudit its one target row; the step does the revocation.
		db
			.update(user)
			.set({ updatedAt: row.updatedAt })
			.where(eq(user.id, row.id))
			.returning({ id: user.id }),
		[revokeSessionsOf()],
	);
	return { ok: true, member: adminMember(row) };
}
