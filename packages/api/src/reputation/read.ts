import type { Database } from "@codesphere/db";
import { reputationEvents } from "@codesphere/db/schema/reputation";
import { eq, inArray, sql } from "drizzle-orm";

// Reads of the journal, apart from `service.ts` (which writes it and re-exports these) so that
// `privileges.ts` can read a Reputation without importing the service that re-exports it.

/** A Member's Reputation: the sum of their journal. An Agent has none (null). */
export async function reputationOf(
	db: Database,
	member: { id: string; kind: string },
) {
	if (member.kind !== "human") {
		return null;
	}
	const [row] = await db
		.select({
			total: sql<number>`COALESCE(SUM(${reputationEvents.points}), 0)::int`,
		})
		.from(reputationEvents)
		.where(eq(reputationEvents.userId, member.id));
	return row?.total ?? 0;
}

/** The Reputation of several Members in one read; a Member without events is absent (0). */
export async function reputationsOf(db: Database, ids: readonly string[]) {
	if (ids.length === 0) {
		return new Map<string, number>();
	}
	const rows = await db
		.select({
			userId: reputationEvents.userId,
			total: sql<number>`SUM(${reputationEvents.points})::int`,
		})
		.from(reputationEvents)
		.where(inArray(reputationEvents.userId, [...ids]))
		.groupBy(reputationEvents.userId);
	return new Map(rows.map((r) => [r.userId, r.total]));
}
