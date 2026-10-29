import { roleCan } from "@codesphere/auth/access";
import { isStaffRole } from "@codesphere/contract/roles";

/**
 * The first back-office screen of a staff role (#285): the KPI dashboard for those who read it,
 * moderation for a moderator.
 */
export function backOfficeHome(role: unknown): "/admin" | "/admin/moderation" {
	return roleCan(role, { kpi: ["read"] }) ? "/admin" : "/admin/moderation";
}

// Where a sign-in lands (#121): staff (admin, super admin, moderator) go to the back-office, any other Member home, and
// a request without a session back to the sign-in page. The OAuth callback cannot know the role
// in advance, so it always comes through /post-signin, which applies this rule.
export function postSignInPath(
	user: { role?: string | null } | null | undefined,
): "/admin" | "/admin/moderation" | "/" | "/signin" {
	if (!user) {
		return "/signin";
	}
	return isStaffRole(user.role) ? backOfficeHome(user.role) : "/";
}
