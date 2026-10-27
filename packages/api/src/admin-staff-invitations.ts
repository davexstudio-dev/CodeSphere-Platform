import {
	grantableRoles,
	type INVITABLE_ROLES,
	type Role,
	staffRank,
} from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import {
	STAFF_INVITATION_DAYS,
	staffInvitation,
} from "@codesphere/db/schema/staff";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { adminMember } from "./admin-members";
import { type StaffActor, setRole } from "./admin-staff";
import { withAudit } from "./audit";

type InvitableRole = (typeof INVITABLE_ROLES)[number];

/** What the API tells the admin screen about one invitation. */
const invitationOf = (row: {
	id: string;
	email: string;
	role: Role;
	invitedBy: string | null;
	createdAt: Date;
	expiresAt: Date;
}) => ({
	id: row.id,
	email: row.email,
	role: row.role as InvitableRole,
	invitedBy: row.invitedBy,
	createdAt: row.createdAt.toISOString(),
	expiresAt: row.expiresAt.toISOString(),
});

const expiryFrom = (now: Date) =>
	new Date(now.getTime() + STAFF_INVITATION_DAYS * 24 * 60 * 60 * 1000);

/** The invitations still waiting: not accepted, not revoked (an expired one stays, to be renewed). */
const open = and(
	isNull(staffInvitation.acceptedAt),
	isNull(staffInvitation.revokedAt),
);

/** Sends the invitation email; `true` when it left, false when there is no mail service or it failed. */
export type SendInvitation = (invitation: {
	email: string;
	role: InvitableRole;
	invitedBy: string;
	days: number;
}) => Promise<boolean>;

export type StaffInviteStatus =
	| "invited"
	| "promoted"
	| "already_staff"
	| "refused";

export type StaffInviteResult = {
	email: string;
	status: StaffInviteStatus;
	invitationId: string | null;
	emailSent: boolean;
};

type Deps = {
	now?: Date;
	superAdminEmails?: ReadonlySet<string>;
	send?: SendInvitation;
};

const mayOffer = (actor: StaffActor, role: Role) =>
	grantableRoles(actor.role).includes(role);

/** The staff accounts, highest role first, and the offers still open, newest first (#286). */
export async function listStaff(db: Database) {
	const [members, invitations] = await Promise.all([
		db
			.select()
			.from(user)
			.where(
				and(
					eq(user.kind, "human"),
					inArray(user.role, ["super_admin", "admin", "moderator"]),
				),
			)
			.orderBy(asc(user.name)),
		db
			.select({
				id: staffInvitation.id,
				email: staffInvitation.email,
				role: staffInvitation.role,
				invitedBy: user.name,
				createdAt: staffInvitation.createdAt,
				expiresAt: staffInvitation.expiresAt,
			})
			.from(staffInvitation)
			.leftJoin(user, eq(user.id, staffInvitation.invitedBy))
			.where(open)
			.orderBy(desc(staffInvitation.createdAt)),
	]);
	const rank = { super_admin: 0, admin: 1, moderator: 2 } as const;
	return {
		members: members
			.map(adminMember)
			.sort(
				(a, b) =>
					(rank[a.role as keyof typeof rank] ?? 3) -
						(rank[b.role as keyof typeof rank] ?? 3) ||
					a.name.localeCompare(b.name),
			),
		invitations: invitations.map(invitationOf),
	};
}

/**
 * Offers `role` to each email (#286), audited as `staff.invite`: the audit row carries the
 * invitation's id and role, never the email. An email that already belongs to a human Member
 * promotes them at once through the audited `setRole` (so rank, the last super admin and sessions
 * are all handled there). Any other email gets an open offer, replacing a previous one, applied at
 * its first verified sign-in. An Agent is never staff. A refusal for one email does not stop the
 * others.
 */
export async function inviteStaff(
	db: Database,
	actor: StaffActor,
	actorName: string,
	emails: readonly string[],
	role: InvitableRole,
	deps: Deps = {},
): Promise<StaffInviteResult[] | { forbidden: true }> {
	if (!mayOffer(actor, role)) {
		return { forbidden: true };
	}
	const now = deps.now ?? new Date();
	const results: StaffInviteResult[] = [];
	// The same address twice in one form is one offer.
	for (const email of [...new Set(emails)]) {
		results.push(await inviteOne(db, actor, actorName, email, role, now, deps));
	}
	return results;
}

async function inviteOne(
	db: Database,
	actor: StaffActor,
	actorName: string,
	email: string,
	role: InvitableRole,
	now: Date,
	deps: Deps,
): Promise<StaffInviteResult> {
	const refused = (status: StaffInviteStatus): StaffInviteResult => ({
		email,
		status,
		invitationId: null,
		emailSent: false,
	});

	const [existing] = await db
		.select()
		.from(user)
		.where(sql`lower(${user.email}) = ${email}`);
	if (existing) {
		if (existing.kind === "agent") {
			return refused("refused");
		}
		// Already this role or a higher one: nothing to give (a demotion is not an invitation).
		if (staffRank(existing.role) >= staffRank(role)) {
			return refused(
				staffRank(existing.role) > 0 ? "already_staff" : "refused",
			);
		}
		if (existing.emailVerified) {
			const outcome = await setRole(
				db,
				actor,
				existing.id,
				role,
				"Invitation",
				deps.superAdminEmails,
			);
			return outcome.ok
				? { email, status: "promoted", invitationId: null, emailSent: false }
				: refused("refused");
		}
		// An unverified address cannot be trusted with a role: it waits for a verified sign-in.
	}

	// One open offer per email: a new one replaces the old.
	await db
		.update(staffInvitation)
		.set({ revokedAt: now })
		.where(and(eq(staffInvitation.email, email), open));
	let rows: Record<string, unknown>[];
	try {
		rows = await withAudit(
			db,
			{
				actorId: actor.id,
				action: "staff.invite",
				targetType: "staff_invitation",
				targetIdColumn: "id",
				details: { to: role },
			},
			db
				.insert(staffInvitation)
				.values({
					email,
					role,
					invitedBy: actor.id,
					createdAt: now,
					expiresAt: expiryFrom(now),
				})
				.returning({ id: staffInvitation.id }),
		);
	} catch {
		// A concurrent invitation of the same email won the unique index.
		return refused("refused");
	}
	const id = String(rows[0]?.id ?? "");
	const emailSent = deps.send
		? await deps
				.send({
					email,
					role,
					invitedBy: actorName,
					days: STAFF_INVITATION_DAYS,
				})
				.catch(() => false)
		: false;
	return { email, status: "invited", invitationId: id, emailSent };
}

export type InvitationOutcome<T> =
	| { ok: true; value: T }
	| { ok: false; code: "NOT_FOUND" | "FORBIDDEN" };

/** Withdraws an open offer (#286), audited as `staff.invite_revoke`. */
export async function revokeInvitation(
	db: Database,
	actor: StaffActor,
	id: string,
	now = new Date(),
): Promise<InvitationOutcome<{ id: string }>> {
	const [row] = await db
		.select()
		.from(staffInvitation)
		.where(and(eq(staffInvitation.id, id), open));
	if (!row) {
		return { ok: false, code: "NOT_FOUND" };
	}
	if (!mayOffer(actor, row.role)) {
		return { ok: false, code: "FORBIDDEN" };
	}
	const done = await withAudit(
		db,
		{
			actorId: actor.id,
			action: "staff.invite_revoke",
			targetType: "staff_invitation",
			targetIdColumn: "id",
			details: { to: row.role },
		},
		db
			.update(staffInvitation)
			.set({ revokedAt: now })
			.where(and(eq(staffInvitation.id, id), open))
			.returning({ id: staffInvitation.id }),
	);
	return done.length === 0
		? { ok: false, code: "NOT_FOUND" }
		: { ok: true, value: { id } };
}

/** Opens an offer for seven more days and sends the email again (#286), audited as `staff.invite_resend`. */
export async function resendInvitation(
	db: Database,
	actor: StaffActor,
	actorName: string,
	id: string,
	deps: Pick<Deps, "now" | "send"> = {},
) {
	const now = deps.now ?? new Date();
	const [row] = await db
		.select()
		.from(staffInvitation)
		.where(and(eq(staffInvitation.id, id), open));
	if (!row) {
		return { ok: false, code: "NOT_FOUND" } as const;
	}
	if (!mayOffer(actor, row.role)) {
		return { ok: false, code: "FORBIDDEN" } as const;
	}
	const done = await withAudit(
		db,
		{
			actorId: actor.id,
			action: "staff.invite_resend",
			targetType: "staff_invitation",
			targetIdColumn: "id",
			details: { to: row.role },
		},
		db
			.update(staffInvitation)
			.set({ expiresAt: expiryFrom(now) })
			.where(and(eq(staffInvitation.id, id), open))
			.returning({ id: staffInvitation.id }),
	);
	if (done.length === 0) {
		return { ok: false, code: "NOT_FOUND" } as const;
	}
	const emailSent = deps.send
		? await deps
				.send({
					email: row.email,
					role: row.role as InvitableRole,
					invitedBy: actorName,
					days: STAFF_INVITATION_DAYS,
				})
				.catch(() => false)
		: false;
	return {
		ok: true,
		value: {
			invitation: invitationOf({ ...row, expiresAt: expiryFrom(now) }),
			emailSent,
		},
	} as const;
}
