import type { Database } from "@codesphere/db";
import { watchItems } from "@codesphere/db/schema/watch";
import { and, eq, sql } from "drizzle-orm";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Counts one outbound click on a visible item and returns its link (null when unknown or hidden).
 * One atomic increment: an aggregate per item, never a record of who clicked or when.
 */
export async function countWatchClick(
	db: Database,
	id: string,
): Promise<string | null> {
	if (!UUID.test(id)) {
		return null;
	}
	const [row] = await db
		.update(watchItems)
		.set({ clickCount: sql`${watchItems.clickCount} + 1` })
		.where(and(eq(watchItems.id, id), eq(watchItems.visibility, "visible")))
		.returning({ url: watchItems.url });
	return row?.url ?? null;
}
