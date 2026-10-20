import type { Role } from "@codesphere/contract/roles";

// Staff roles are designated by environment variables (spec §2). Only a verified email counts, so
// an unverified provider address cannot grant a role. A human holds the highest role whose list
// names their email: super_admin, then admin, then moderator.
export function parseAdminEmails(raw: string | undefined): ReadonlySet<string> {
	return new Set(
		(raw ?? "")
			.split(",")
			.map((email) => email.trim().toLowerCase())
			.filter((email) => email.length > 0),
	);
}

export function isAdminEmail(
	email: string,
	emailVerified: boolean,
	admins: ReadonlySet<string>,
): boolean {
	return emailVerified && admins.has(email.trim().toLowerCase());
}

export type { Role } from "@codesphere/contract/roles";

export type StaffLists = {
	superAdmins: ReadonlySet<string>;
	admins: ReadonlySet<string>;
	moderators: ReadonlySet<string>;
};

// The role a new human account starts with (#120): the highest list naming their verified email.
// Only the seed: afterwards the role lives in the database and roleAtSignIn keeps it (#285).
export function roleFor(
	user: { email: string; emailVerified: boolean },
	staff: StaffLists,
): Role {
	if (isAdminEmail(user.email, user.emailVerified, staff.superAdmins)) {
		return "super_admin";
	}
	if (isAdminEmail(user.email, user.emailVerified, staff.admins)) {
		return "admin";
	}
	if (isAdminEmail(user.email, user.emailVerified, staff.moderators)) {
		return "moderator";
	}
	return "member";
}

/**
 * The role a returning human holds after signing in (#285). The role lives in the database and is
 * managed from the back-office; the lists only seed it when the account is created (roleFor). The
 * one exception is SUPER_ADMIN_EMAILS: a verified email there is always put back to super_admin, so
 * the staff can never lose its top role.
 */
export function roleAtSignIn(
	user: { email: string; emailVerified: boolean; role: Role | null },
	staff: StaffLists,
): Role {
	if (isAdminEmail(user.email, user.emailVerified, staff.superAdmins)) {
		return "super_admin";
	}
	return user.role ?? "member";
}
