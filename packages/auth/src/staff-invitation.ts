import { type Role, staffRank } from "@codesphere/contract/roles";
import type { Database } from "@codesphere/db";
import { sql } from "drizzle-orm";

/**
 * The role an open invitation gives (#286), or null when it gives nothing: it only ever raises. A
 * Member who is already as high or higher keeps their role; the offer is then simply left to expire.
 */
export function roleFromInvitation(
	current: Role | null,
	offered: Role,
): Role | null {
	return staffRank(offered) > staffRank(current) ? offered : null;
}

/**
 * Applies the open invitation of a verified email at sign-in (#286): the role, the closing of the
 * offer and its audit row (`staff.invite_accept`, the Member as actor) land in ONE statement, since
 * the Worker's HTTP driver has no transactions. Nothing happens for an expired, revoked or already
 * accepted offer, nor for an offer that would not raise the role. Returns the role given, or null.
 *
 * The caller must have checked that the email is verified and the account is a human's: an
 * unverified address, or an Agent, never gets a role this way.
 */
export async function acceptStaffInvitation(
	db: Database,
	member: { id: string; email: string; role: Role | null },
	now: Date = new Date(),
): Promise<Role | null> {
	const email = member.email.trim().toLowerCase();
	const result = await db.execute(sql`
		WITH offer AS (
			SELECT id, role FROM staff_invitation
			WHERE lower(email) = ${email}
				AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ${now}
				-- Only an offer that raises the role is worth taking (rank: moderator < admin < super_admin).
				AND CASE role WHEN 'super_admin' THEN 3 WHEN 'admin' THEN 2 WHEN 'moderator' THEN 1 ELSE 0 END
					> CASE ${member.role ?? "member"}::text WHEN 'super_admin' THEN 3 WHEN 'admin' THEN 2 WHEN 'moderator' THEN 1 ELSE 0 END
			ORDER BY CASE role WHEN 'super_admin' THEN 3 WHEN 'admin' THEN 2 ELSE 1 END DESC
			LIMIT 1
		),
		closed AS (
			UPDATE staff_invitation SET accepted_at = ${now}
			WHERE id IN (SELECT id FROM offer) AND accepted_at IS NULL AND revoked_at IS NULL
			RETURNING id, role
		),
		promoted AS (
			UPDATE "user" SET role = (SELECT role FROM closed)
			WHERE id = ${member.id} AND EXISTS (SELECT 1 FROM closed)
			RETURNING id
		),
		logged AS (
			INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
			SELECT ${member.id}, 'staff.invite_accept', 'staff_invitation', closed.id::text,
				jsonb_build_object('from', ${member.role ?? "member"}::text, 'to', closed.role::text)
			FROM closed
			RETURNING id
		)
		SELECT closed.role::text AS role FROM closed
	`);
	const rows = Array.isArray(result)
		? result
		: (result as { rows: Record<string, unknown>[] }).rows;
	const role = rows[0]?.role;
	return typeof role === "string" ? (role as Role) : null;
}
