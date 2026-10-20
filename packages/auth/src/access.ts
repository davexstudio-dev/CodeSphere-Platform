import type { Role } from "@codesphere/contract/roles";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

// Access control of Better Auth's admin plugin (#120, #285): what each role may do, as
// resource/action pairs. Shared by the server (packages/auth, packages/api) and the web client, so a
// screen asks the same question the API answers.
//
// The back-office resources mirror the admin procedures of the API. The plugin's own `user` and
// `session` endpoints stay closed: a role change, a deactivation and a session revocation go through
// the audited `staff` procedures of the API (the audit row and the change land in one statement),
// never through the plugin's /admin endpoints.
export const statement = {
	...defaultStatements,
	moderation: ["list", "suspend", "reactivate", "remove"],
	tag: ["list", "create", "rename", "reserve", "delete"],
	audit: ["read", "export"],
	hackathon: ["update"],
	organization: ["manage"],
	job: ["manage"],
	team: ["manage"],
	watch: ["manage"],
	social: ["manage"],
	kpi: ["read"],
	staff: ["list", "invite", "set-role", "deactivate", "revoke-sessions"],
} as const;

export const ac = createAccessControl(statement);

// Moderators keep the community clean: Members, Tags, and a read of the journal.
const moderator = {
	moderation: ["list", "suspend", "reactivate", "remove"],
	tag: ["list", "create", "rename", "reserve", "delete"],
	audit: ["read"],
	user: ["list", "get"],
	session: ["list"],
} as const;

// Admins run the platform. They manage the staff below them; rank (outranks) and the grantable roles
// (grantableRoles in the contract) decide whom.
const admin = {
	...moderator,
	audit: ["read", "export"],
	hackathon: ["update"],
	organization: ["manage"],
	job: ["manage"],
	team: ["manage"],
	watch: ["manage"],
	social: ["manage"],
	kpi: ["read"],
	staff: ["list", "invite", "set-role", "deactivate", "revoke-sessions"],
} as const;

export const roles = {
	member: ac.newRole({}),
	moderator: ac.newRole(moderator),
	admin: ac.newRole(admin),
	super_admin: ac.newRole(admin),
} satisfies Record<Role, unknown>;

export type Permissions = {
	[R in keyof typeof statement]?: (typeof statement)[R][number][];
};

/** Whether `role` holds every permission asked: false for an unknown role. */
export function roleCan(role: unknown, permissions: Permissions): boolean {
	const entry = roles[role as Role];
	return entry ? entry.authorize(permissions as never).success : false;
}
