import { isStaffRole, outranks, rolesBelow } from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import { session, user } from "@codesphere/db/schema/auth";
import {
	and,
	desc,
	eq,
	inArray,
	isNotNull,
	isNull,
	lt,
	or,
	type SQL,
	sql,
} from "drizzle-orm";

import { withAudit } from "./audit";
import { decodeCursor, encodeCursor } from "./cursor";

export type AdminMemberRow = typeof user.$inferSelect;

export const adminMember = (row: AdminMemberRow) => ({
	id: row.id,
	name: row.name,
	kind: row.kind === "agent" ? ("agent" as const) : ("human" as const),
	ownerId: row.ownerId,
	email: row.email,
	role: isStaffRole(row.role) ? row.role : ("member" as const),
	createdAt: row.createdAt.toISOString(),
	suspendedAt: row.suspendedAt?.toISOString() ?? null,
	suspensionReason: row.suspensionReason,
});

/** Escapes LIKE wildcards so a typed `%` or `_` matches itself. */
const likePattern = (text: string) =>
	`%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

export type MemberFilter = {
	status?: "active" | "suspended";
	q?: string;
	cursor?: string;
	limit: number;
};

/** One page of Members, newest first; `null` when the cursor was not issued by the server. */
export async function listMembers(db: Database, filter: MemberFilter) {
	const position = filter.cursor ? decodeCursor(filter.cursor) : null;
	if (filter.cursor && !position) {
		return null;
	}
	const text: SQL | undefined = filter.q
		? or(
				sql`${user.name} ilike ${likePattern(filter.q)}`,
				sql`${user.email} ilike ${likePattern(filter.q)}`,
			)
		: undefined;
	const rows = await db
		.select()
		.from(user)
		.where(
			and(
				filter.status === "suspended" ? isNotNull(user.suspendedAt) : undefined,
				filter.status === "active" ? isNull(user.suspendedAt) : undefined,
				text,
				position
					? or(
							lt(user.createdAt, position.createdAt),
							and(
								eq(user.createdAt, position.createdAt),
								lt(user.id, position.id),
							),
						)
					: undefined,
			),
		)
		.orderBy(desc(user.createdAt), desc(user.id))
		.limit(filter.limit + 1);
	const page = rows.slice(0, filter.limit);
	const last = page.at(-1);
	return {
		items: page.map(adminMember),
		nextCursor:
			rows.length > filter.limit && last
				? encodeCursor(last.createdAt, last.id)
				: null,
	};
}

export type SuspensionOutcome =
	| { ok: true; member: ReturnType<typeof adminMember> }
	| { ok: false; code: "NOT_FOUND" | "CONFLICT" | "FORBIDDEN" };

/**
 * Suspends or reactivates a Member and writes the audit event in one statement (#122). The
 * `WHERE` carries the state the call expects, so a Member already in the target state matches
 * no row: that is the CONFLICT, told apart from an unknown id by one follow-up read.
 *
 * The actor must outrank the target (a moderator cannot touch an admin, an admin cannot touch a
 * peer): the rank rides in the same `WHERE`, so a role change between a read and the write cannot
 * slip through. A Member the actor may not moderate is FORBIDDEN, not CONFLICT.
 */
export async function setSuspension(
	db: Database,
	actorId: string,
	actorRole: string,
	targetId: string,
	change: { suspend: true; reason: string } | { suspend: false },
): Promise<SuspensionOutcome> {
	const withinReach = or(
		isNull(user.role),
		inArray(user.role, rolesBelow(actorRole)),
	);
	const mutation = change.suspend
		? db
				.update(user)
				.set({ suspendedAt: new Date(), suspensionReason: change.reason })
				.where(
					and(eq(user.id, targetId), isNull(user.suspendedAt), withinReach),
				)
				.returning({ id: user.id, role: user.role })
		: db
				.update(user)
				.set({ suspendedAt: null, suspensionReason: null })
				.where(
					and(eq(user.id, targetId), isNotNull(user.suspendedAt), withinReach),
				)
				.returning({ id: user.id });
	const changed = await withAudit(
		db,
		{
			actorId,
			action: change.suspend ? "member.suspend" : "member.reactivate",
			targetType: "member",
			targetIdColumn: "id",
			details: change.suspend ? { reason: change.reason } : undefined,
		},
		mutation,
		// A deactivated staff member loses the back-office at once (#285): their sessions go with the
		// suspension. A plain Member keeps reading (#123), so their sessions stay.
		change.suspend
			? [
					sql`DELETE FROM ${session} WHERE ${session.userId} IN (SELECT id FROM m WHERE role <> 'member')`,
				]
			: [],
	);
	const [row] = await db.select().from(user).where(eq(user.id, targetId));
	if (!row) {
		return { ok: false, code: "NOT_FOUND" };
	}
	if (changed.length === 0) {
		return {
			ok: false,
			code: outranks(actorRole, row.role) ? "CONFLICT" : "FORBIDDEN",
		};
	}
	return { ok: true, member: adminMember(row) };
}
