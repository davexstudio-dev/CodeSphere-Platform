import type { Database } from "@codesphere/db";
import { outboxEvents } from "@codesphere/db/schema/outbox";
import { type SQL, sql } from "drizzle-orm";

// Emitting an event (#259). The edge database has no interactive transactions, so an event is
// written in the SAME statement as the change it describes: either both land or neither does.

export type OutboxEventInput = {
	/** `<entity>.<verb>`: organization.validated. */
	type: string;
	aggregateType: string;
	/** Small facts a consumer needs; it should fetch the current state of the aggregate for the rest. */
	payload?: Record<string, unknown>;
	/** Emitting twice with the same key writes once. */
	dedupeKey?: string;
};

/**
 * The step that writes an event next to a mutation of `withAudit` (or any `WITH m AS (...)`
 * statement): `aggregateIdColumn` names the column of the mutation's RETURNING holding the id of
 * what changed. It writes nothing when the mutation matched no row.
 */
export function outboxInsert(
	event: OutboxEventInput & { aggregateIdColumn: string },
): SQL {
	return sql`
		INSERT INTO outbox_events (type, aggregate_type, aggregate_id, payload, dedupe_key)
		SELECT ${event.type}::text, ${event.aggregateType}::text, (m.${sql.identifier(event.aggregateIdColumn)})::text,
			${JSON.stringify(event.payload ?? {})}::jsonb, ${event.dedupeKey ?? null}::text
		FROM m
		ON CONFLICT (dedupe_key) DO NOTHING`;
}

/** An event with no mutation next to it (a fact the application observed). One statement, idempotent on `dedupeKey`. */
export async function publishEvent(
	db: Database,
	event: OutboxEventInput & { aggregateId: string },
) {
	await db
		.insert(outboxEvents)
		.values({
			type: event.type,
			aggregateType: event.aggregateType,
			aggregateId: event.aggregateId,
			payload: event.payload ?? {},
			dedupeKey: event.dedupeKey ?? null,
		})
		.onConflictDoNothing({ target: outboxEvents.dedupeKey });
}
