import type { Session } from "@codesphere/auth";
import { type Permissions, roleCan } from "@codesphere/auth/access";
import { isStaffRole, type StaffRole } from "@codesphere/contract";

export type AdminGuard =
	| { ok: true; role: StaffRole }
	| { ok: false; code: "UNAUTHORIZED" | "FORBIDDEN" };

// The authorization decision behind every admin procedure (spec §2): a session is required, and its
// user must be a human holding a staff role (super_admin, admin or moderator) and not deactivated
// (#285). An Agent is never staff, whatever its row says (#122).
export function requireAdmin(session: Session | null): AdminGuard {
	if (!session?.user) {
		return { ok: false, code: "UNAUTHORIZED" };
	}
	const { role, kind, suspendedAt } = session.user as {
		role?: string;
		kind?: string;
		suspendedAt?: Date | string | null;
	};
	if (kind !== "human" || !isStaffRole(role) || suspendedAt) {
		return { ok: false, code: "FORBIDDEN" };
	}
	return { ok: true, role };
}

// requireAdmin, then what the staff role may do (#285): the access control of Better Auth's admin
// plugin (packages/auth/src/access.ts), the same matrix the back-office screens read.
export function requirePermission(
	session: Session | null,
	permissions: Permissions,
): AdminGuard {
	const guard = requireAdmin(session);
	if (!guard.ok || roleCan(guard.role, permissions)) {
		return guard;
	}
	return { ok: false, code: "FORBIDDEN" };
}
