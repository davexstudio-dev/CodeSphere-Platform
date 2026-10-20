// Roles a human Member can hold (spec §2). `member` is everyone else. The API and the web app read
// the same list, so a staff role is recognised the same way on both sides.
export const STAFF_ROLES = ["super_admin", "admin", "moderator"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

/** The plain Member's role: the default of every account. */
export const DEFAULT_ROLE = "member" as const;

/**
 * Every role an account can hold, lowest first. The single source of the Postgres `user_role`
 * enum (packages/db), of the Better Auth access control (packages/auth) and of the types below.
 */
export const ROLES = [
	DEFAULT_ROLE,
	"moderator",
	"admin",
	"super_admin",
] as const;

export type Role = (typeof ROLES)[number];

const RANK: Record<StaffRole, number> = {
	super_admin: 3,
	admin: 2,
	moderator: 1,
};

/** Authority of a role: 0 for a plain Member, 1 to 3 for moderator, admin and super_admin. */
export function staffRank(role: unknown): number {
	return isStaffRole(role) ? RANK[role] : 0;
}

/** Whether `actor` may act on `target`: strictly higher rank, so peers and superiors are out of reach. */
export function outranks(actor: unknown, target: unknown): boolean {
	return staffRank(actor) > staffRank(target);
}

/** The roles a Member may hold and still be moderated by `actor`: `member` and every staff role below. */
export function rolesBelow(actor: unknown): Role[] {
	return [
		"member",
		...STAFF_ROLES.filter((role) => RANK[role] < staffRank(actor)),
	];
}

/** True for the roles that may use the admin procedures and the admin area. */
export function isStaffRole(role: unknown): role is StaffRole {
	return STAFF_ROLES.includes(role as StaffRole);
}

/**
 * The roles `actor` may give (#285): a super_admin gives any role, an admin gives up to admin (an
 * admin may bring in a peer, never a super_admin), anyone else gives none.
 */
export function grantableRoles(actor: unknown): Role[] {
	if (actor === "super_admin") {
		return [...ROLES];
	}
	if (actor === "admin") {
		return ["member", "moderator", "admin"];
	}
	return [];
}

/**
 * Whether `actor` may move a Member from `current` to `next` (#285). Rank still rules: an admin only
 * reaches roles strictly below theirs. A super_admin is the exception and reaches other
 * super_admins, so the staff can never be locked out of its top role; the API keeps the last one.
 */
export function canChangeRole(
	actor: unknown,
	current: unknown,
	next: Role,
): boolean {
	if (!grantableRoles(actor).includes(next) || current === next) {
		return false;
	}
	return actor === "super_admin" || outranks(actor, current);
}
