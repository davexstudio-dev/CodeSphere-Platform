import type {
	AdminMember as AdminMemberSchema,
	AuditEvent as AuditEventSchema,
} from "@codesphere/contract";
import { outranks } from "@codesphere/contract";
import type { AuditEntry } from "@codesphere/ui/components/organisms/audit-log";
import type { z } from "zod";

import { adminErrorKey } from "@/i18n/errors";

type AdminMember = z.infer<typeof AdminMemberSchema>;
type AuditEvent = z.infer<typeof AuditEventSchema>;

export type MemberGroup = "suspended" | "agents" | "active";

/** The group of the moderation list (#117): suspended first, then agents, then active humans. */
export function memberGroup(member: AdminMember): MemberGroup {
	if (member.suspendedAt) {
		return "suspended";
	}
	return member.kind === "agent" ? "agents" : "active";
}

/** Whether the signed-in staff may suspend `member`; the refusal says why, before any action. */
export function canModerate(
	member: AdminMember,
	selfId: string | undefined,
	actorRole?: string,
): { ok: true } | { ok: false; reason: "self" | "rank" } {
	if (member.id === selfId) {
		return { ok: false, reason: "self" };
	}
	if (actorRole !== undefined && !outranks(actorRole, member.role)) {
		return { ok: false, reason: "rank" };
	}
	return { ok: true };
}

/** Key of the message of a failed moderation call. */
export const moderationErrorKey = adminErrorKey;

const DESTRUCTIVE = /\.(suspend|remove|delete)$/;
const WARNING = /\.(update|rename|reactivate)$/;

/** An audit event as a row of `AuditLog`; `nameOf` resolves an id to a display name when known. */
export function auditEntryOf(
	event: AuditEvent,
	nameOf: (id: string) => string | undefined,
	formatDate: (iso: string) => string,
	systemLabel: string,
	/** The readable name of an action key; the key itself when the page has none. */
	actionLabel: (action: string) => string = (action) => action,
): AuditEntry {
	const target = event.targetId
		? (nameOf(event.targetId) ?? `${event.targetType} ${event.targetId}`)
		: event.targetType;
	return {
		id: event.id,
		at: formatDate(event.createdAt),
		actor: event.actorId
			? (nameOf(event.actorId) ?? event.actorId)
			: systemLabel,
		action: actionLabel(event.action),
		actionKey: event.action,
		actorId: event.actorId,
		targetType: event.targetType,
		targetId: event.targetId,
		details: event.details,
		target,
		tone: DESTRUCTIVE.test(event.action)
			? "destructive"
			: WARNING.test(event.action)
				? "warning"
				: "default",
		reason: event.details?.reason,
	};
}
