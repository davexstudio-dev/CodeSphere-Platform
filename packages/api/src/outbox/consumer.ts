import type { Database } from "@codesphere/db";
import { processedEvents } from "@codesphere/db/schema/outbox";
import { and, eq, sql } from "drizzle-orm";

import type { EventQueue, QueueMessage } from "./relay";

// Consumers (#259). The queue delivers at least once, so a consumer must tolerate seeing an event
// twice. Two ways to do it:
//
//   - `atomic: true`: the handler writes its effect and the `processed_events` marker in ONE
//     statement (see `effectOnce`): the effect happens exactly once, even across a crash.
//   - otherwise: the event is delivered once the handler succeeded AND the marker was written; a
//     crash between the two runs the handler again, so the handler itself must be idempotent
//     (an upsert, a "set to", a send with an idempotency key).

export type Consumer = {
	/** Stable name: it keys the `processed_events` markers. */
	name: string;
	/** Event types handled, or `*` for all. */
	types: readonly string[] | "*";
	atomic?: boolean;
	handle(message: QueueMessage, db: Database): Promise<void>;
};

const wants = (consumer: Consumer, message: QueueMessage) =>
	consumer.types === "*" || consumer.types.includes(message.type);

/**
 * Hands a message to every consumer that wants it, once each. A consumer that already processed
 * it is skipped; one that fails is reported after the others ran, so a retry only redoes it.
 */
export async function deliver(
	db: Database,
	consumers: readonly Consumer[],
	message: QueueMessage,
) {
	const handled: string[] = [];
	const skipped: string[] = [];
	const errors: unknown[] = [];
	for (const consumer of consumers.filter((c) => wants(c, message))) {
		try {
			if (!consumer.atomic) {
				const [done] = await db
					.select({ id: processedEvents.eventId })
					.from(processedEvents)
					.where(
						and(
							eq(processedEvents.consumer, consumer.name),
							eq(processedEvents.eventId, message.id),
						),
					)
					.limit(1);
				if (done) {
					skipped.push(consumer.name);
					continue;
				}
			}
			await consumer.handle(message, db);
			if (consumer.atomic) {
				// An atomic consumer writes its own marker (effectOnce); one that did not would apply its
				// effect again on every redelivery, so it is refused loudly.
				const [marker] = await db
					.select({ id: processedEvents.eventId })
					.from(processedEvents)
					.where(
						and(
							eq(processedEvents.consumer, consumer.name),
							eq(processedEvents.eventId, message.id),
						),
					)
					.limit(1);
				if (!marker) {
					throw new Error(
						`atomic consumer ${consumer.name} did not record its marker: use effectOnce`,
					);
				}
			} else {
				await db
					.insert(processedEvents)
					.values({ consumer: consumer.name, eventId: message.id })
					.onConflictDoNothing();
			}
			handled.push(consumer.name);
		} catch (error) {
			errors.push(error);
		}
	}
	if (errors.length > 0) {
		throw new AggregateError(errors, `consumer failed for event ${message.id}`);
	}
	return { handled, skipped };
}

/**
 * Runs `effect` (a statement reading `mark`) only the first time `consumer` sees `eventId`, in one
 * statement with the marker: `effectOnce(db, "stats", id, (mark) => sql\`INSERT ... FROM ${mark}\`)`.
 * Returns whether the effect ran.
 */
export async function effectOnce(
	db: Database,
	consumer: string,
	eventId: string,
	effect: (mark: ReturnType<typeof sql.raw>) => ReturnType<typeof sql>,
): Promise<boolean> {
	const result = await db.execute(sql`
		WITH mark AS (
			INSERT INTO processed_events (consumer, event_id) VALUES (${consumer}, ${eventId}::uuid)
			ON CONFLICT DO NOTHING RETURNING event_id
		), effect AS (${effect(sql.raw("mark"))} RETURNING 1)
		SELECT (SELECT count(*) FROM mark)::int AS ran`);
	const rows = (
		Array.isArray(result) ? result : (result as { rows: unknown[] }).rows
	) as { ran: number }[];
	return Number(rows[0]?.ran ?? 0) > 0;
}

/**
 * A local queue: sends each message straight to the consumers (the Bun server, tests). A message
 * whose consumer fails is reported alone, so one poison event never holds back its neighbours.
 */
export function localQueue(
	db: Database,
	consumers: readonly Consumer[],
): EventQueue {
	return {
		async sendBatch(messages) {
			const failed: string[] = [];
			for (const message of messages) {
				try {
					await deliver(db, consumers, message);
				} catch {
					failed.push(message.id);
				}
			}
			return { failed };
		},
	};
}
