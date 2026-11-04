import { auditLog } from "@codesphere/db/schema/audit";
import { and, eq } from "drizzle-orm";

export type AuditFilter = {
	action?: string;
	actorId?: string;
	targetType?: string;
	targetId?: string;
};

/** The WHERE of the journal's filters, shared by the paged list and the CSV export (#287). */
export const auditFilterOf = (input: AuditFilter) =>
	and(
		input.action ? eq(auditLog.action, input.action) : undefined,
		input.actorId ? eq(auditLog.actorId, input.actorId) : undefined,
		input.targetType ? eq(auditLog.targetType, input.targetType) : undefined,
		input.targetId ? eq(auditLog.targetId, input.targetId) : undefined,
	);

/** A journal row as the API returns it. */
export const auditEventOf = (row: typeof auditLog.$inferSelect) => ({
	id: row.id,
	actorId: row.actorId,
	action: row.action,
	targetType: row.targetType,
	targetId: row.targetId,
	details: row.details ?? null,
	createdAt: row.createdAt.toISOString(),
});
