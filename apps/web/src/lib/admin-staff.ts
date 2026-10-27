import {
	canChangeRole,
	grantableRoles,
	INVITABLE_ROLES,
	type Role,
	STAFF_INVITE_MAX_EMAILS,
	staffRank,
} from "@codesphere/contract";

// The rules of the staff screen (#286), kept out of the page so they can be tested. The API enforces
// the same ones (admin-staff.ts); this only decides what the screen offers and says why not.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParsedEmails = {
	/** Lowercased, trimmed, without duplicates, in the order typed. */
	valid: string[];
	/** What could not be read as an email address. */
	invalid: string[];
	/** More than the form takes: the ones past the limit. */
	overflow: string[];
};

/** Reads the emails typed in the invitation form: separated by commas, semicolons, spaces or lines. */
export function parseInviteEmails(text: string): ParsedEmails {
	const seen = new Set<string>();
	const valid: string[] = [];
	const invalid: string[] = [];
	for (const raw of text.split(/[\s,;]+/)) {
		const email = raw.trim().toLowerCase();
		if (!email || seen.has(email)) {
			continue;
		}
		seen.add(email);
		(EMAIL.test(email) ? valid : invalid).push(email);
	}
	return {
		valid: valid.slice(0, STAFF_INVITE_MAX_EMAILS),
		invalid,
		overflow: valid.slice(STAFF_INVITE_MAX_EMAILS),
	};
}

/** The roles the actor may offer in the form: invitable ones that they may grant. */
export function offerableRoles(actorRole: unknown) {
	const grantable = grantableRoles(actorRole);
	return INVITABLE_ROLES.filter((role) => grantable.includes(role));
}

/** The roles a staff account can be moved to by the actor (never its own, never a no-op). */
export function rolesTo(
	actorRole: unknown,
	member: { id: string; role: string },
	selfId: string | undefined,
): Role[] {
	if (member.id === selfId) {
		return [];
	}
	return grantableRoles(actorRole).filter((role) =>
		canChangeRole(actorRole, member.role, role),
	);
}

export type StaffGroup = "super_admin" | "admin" | "moderator" | "pending";

export const STAFF_GROUPS: StaffGroup[] = [
	"super_admin",
	"admin",
	"moderator",
	"pending",
];

/** The group of a staff account on the list: its role, highest first. */
export function staffGroup(role: string): Exclude<StaffGroup, "pending"> {
	return role === "super_admin" || role === "admin" ? role : "moderator";
}

/** Whether `actor` can act (deactivate, sign out) on `member`: strictly below their rank, not oneself. */
export function mayManage(
	actorRole: unknown,
	member: { id: string; role: string },
	selfId: string | undefined,
): { ok: true } | { ok: false; reason: "self" | "rank" } {
	if (member.id === selfId) {
		return { ok: false, reason: "self" };
	}
	return staffRank(actorRole) > staffRank(member.role)
		? { ok: true }
		: { ok: false, reason: "rank" };
}

/** Days left on an offer at `now`, rounded up; 0 or less once it has expired. */
export function daysLeft(expiresAt: string, now: Date): number {
	return Math.ceil((Date.parse(expiresAt) - now.getTime()) / 86_400_000);
}
