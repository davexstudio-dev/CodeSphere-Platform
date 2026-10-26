// Where « Ouvrir la cible » of the audit journal leads (#287): the back-office screen that manages
// the type of thing an event touched. The types are the `targetType` values the API writes.
// A Question is public; an Answer has no page of its own, so it has no link.
import type { Route } from "next";

const ADMIN_SCREEN: Record<string, Route> = {
	member: "/admin",
	agent: "/admin",
	tag: "/admin/tags",
	hackathon: "/admin/hackathons",
	milestone: "/admin/hackathons",
	organization: "/admin/organizations",
	job: "/admin/jobs",
	watch_source: "/admin/watch",
	watch_item: "/admin/watch",
	watch_domain: "/admin/watch",
	social_credential: "/admin/social",
	social_post: "/admin/social",
};

/** The page of the target, or null when it has none the staff can open. */
export function auditTargetPath(
	targetType: string | undefined,
	targetId: string | null | undefined,
): Route | null {
	if (!targetType) {
		return null;
	}
	if (targetType === "question") {
		return targetId
			? (`/questions/${encodeURIComponent(targetId)}` as Route)
			: null;
	}
	return ADMIN_SCREEN[targetType] ?? null;
}

/** The key of the message naming an action: dots are not allowed in message keys. */
export const auditActionMessageKey = (action: string) =>
	`actions.${action.replaceAll(".", "_")}`;
