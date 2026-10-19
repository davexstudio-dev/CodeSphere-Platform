import type { Database } from "@codesphere/db";
import { OUTBOX_MAX_ATTEMPTS } from "@codesphere/db/schema/outbox";
import { sql } from "drizzle-orm";

// The relay (#259): drains the outbox into a queue. Delivery is AT LEAST ONCE: an event is marked
// published only after the queue accepted it, so a crash in between sends it again, and the
// consumers (consumer.ts) recognise the second delivery. Nothing is lost, nothing is applied twice.

/** An event as the queue carries it. */
export type QueueMessage = {
	id: string;
	type: string;
	aggregateType: string;
	aggregateId: string;
	payload: Record<string, unknown>;
	createdAt: string;
};

/** What the relay needs from a queue: Cloudflare Queues' `sendBatch`, or a local dispatcher. */
export interface EventQueue {
	/**
	 * Sends the messages. Throwing fails the whole batch; a queue that can tell which ones failed
	 * returns their ids, so only those are retried and the others are marked published.
	 */
	sendBatch(messages: QueueMessage[]): Promise<void | { failed: string[] }>;
}

type Claimed = {
	id: string;
	type: string;
	aggregate_type: string;
	aggregate_id: string;
	payload: Record<string, unknown>;
	created_at: string | Date;
	attempts: number;
};

const rowsOf = <T>(result: unknown): T[] =>
	(Array.isArray(result)
		? result
		: (result as { rows: unknown[] }).rows) as T[];

export type DrainOptions = {
	/** Events sent per run. */
	batchSize?: number;
	/** How long a claimed event stays reserved to its relay: a crashed relay frees it after this. */
	leaseMs?: number;
	maxAttempts?: number;
	now?: () => number;
};

/** Backoff after a failed send: 1 s, 2 s, 4 s... up to 5 minutes. */
export const backoffMs = (attempts: number) =>
	Math.min(2 ** Math.max(attempts - 1, 0) * 1000, 300_000);

/**
 * One run of the relay: gives up on the events that failed too often, claims a batch (`FOR UPDATE
 * SKIP LOCKED`, so two relays never take the same events), sends it, and marks it published.
 */
export async function drainOutbox(
	db: Database,
	queue: EventQueue,
	options: DrainOptions = {},
) {
	const batchSize = options.batchSize ?? 50;
	const leaseMs = options.leaseMs ?? 120_000;
	const maxAttempts = options.maxAttempts ?? OUTBOX_MAX_ATTEMPTS;
	const at = new Date((options.now ?? Date.now)());
	const until = new Date(at.getTime() + leaseMs);

	await db.execute(sql`
		UPDATE outbox_events SET failed_at = ${at}
		WHERE published_at IS NULL AND failed_at IS NULL AND attempts >= ${maxAttempts}
			AND (locked_until IS NULL OR locked_until <= ${at})`);

	// Ordered by the database: the timestamps have microseconds a JavaScript Date would drop.
	const claimed = rowsOf<Claimed>(
		await db.execute(sql`
			WITH taken AS (
				UPDATE outbox_events SET locked_until = ${until}, attempts = attempts + 1
				WHERE id IN (
					SELECT id FROM outbox_events
					WHERE published_at IS NULL AND failed_at IS NULL
						AND (locked_until IS NULL OR locked_until <= ${at})
					ORDER BY created_at, id
					LIMIT ${batchSize}
					FOR UPDATE SKIP LOCKED
				)
				RETURNING id, type, aggregate_type, aggregate_id, payload, created_at, attempts
			)
			SELECT * FROM taken ORDER BY created_at, id`),
	);
	if (claimed.length === 0) {
		return { claimed: 0, published: 0, failed: 0 };
	}

	const messages: QueueMessage[] = claimed.map((row) => ({
		id: row.id,
		type: row.type,
		aggregateType: row.aggregate_type,
		aggregateId: row.aggregate_id,
		payload: row.payload,
		createdAt: new Date(row.created_at).toISOString(),
	}));
	const ids = sql.join(
		claimed.map((row) => sql`${row.id}::uuid`),
		sql`, `,
	);
	let failedIds: string[] = [];
	try {
		failedIds = (await queue.sendBatch(messages))?.failed ?? [];
	} catch (error) {
		const reason =
			error instanceof Error ? error.message.slice(0, 300) : "send failed";
		// Back off per event; the event stays pending and is claimed again once its delay is over.
		await db.execute(sql`
			UPDATE outbox_events SET last_error = ${reason},
				locked_until = ${at}::timestamp + LEAST(power(2, GREATEST(attempts - 1, 0)) * 1000, 300000) * interval '1 millisecond'
			WHERE id IN (${ids}) AND published_at IS NULL`);
		return { claimed: claimed.length, published: 0, failed: claimed.length };
	}
	const failed = new Set(failedIds);
	const okIds = claimed.filter((row) => !failed.has(row.id));
	if (failed.size > 0) {
		const badIds = sql.join(
			[...failed].map((id) => sql`${id}::uuid`),
			sql`, `,
		);
		await db.execute(sql`
			UPDATE outbox_events SET last_error = 'consumer failed',
				locked_until = ${at}::timestamp + LEAST(power(2, GREATEST(attempts - 1, 0)) * 1000, 300000) * interval '1 millisecond'
			WHERE id IN (${badIds}) AND published_at IS NULL`);
	}
	if (okIds.length > 0) {
		// A crash here sends the batch again after the lease: that is the "at least once". Guarded,
		// so a slow relay never rewrites what another one already marked.
		await db.execute(sql`
			UPDATE outbox_events SET published_at = ${new Date((options.now ?? Date.now)())}, locked_until = NULL, last_error = NULL
			WHERE id IN (${sql.join(
				okIds.map((row) => sql`${row.id}::uuid`),
				sql`, `,
			)}) AND published_at IS NULL`);
	}
	return {
		claimed: claimed.length,
		published: okIds.length,
		failed: failed.size,
	};
}

/** Retries of the Queues consumer in wrangler.jsonc (`max_retries`): after them the message goes to the dead-letter queue. */
export const QUEUE_MAX_RETRIES = 6;

/**
 * A consumer gave up on an event for good (its queue retries are over): the outbox row is marked
 * failed, so `outboxStatus` shows it and an Admin can act, instead of it vanishing into the
 * dead-letter queue while the row still reads "published".
 */
export async function markConsumerFailed(
	db: Database,
	eventId: string,
	reason: string,
) {
	await db.execute(sql`
		UPDATE outbox_events SET failed_at = now(), last_error = ${reason.slice(0, 300)}
		WHERE id = ${eventId}::uuid AND failed_at IS NULL`);
}

/**
 * How the outbox stands: for an Admin and for alerts. `failed` counts the events given up on, by the
 * relay or by the queue's consumers after their retries. Ages are measured by the database's clock.
 */
export async function outboxStatus(db: Database) {
	const [row] = rowsOf<{
		pending: number;
		failed: number;
		oldest_pending_seconds: number | null;
	}>(
		await db.execute(sql`
			SELECT
				count(*) FILTER (WHERE published_at IS NULL AND failed_at IS NULL)::int AS pending,
				count(*) FILTER (WHERE failed_at IS NOT NULL)::int AS failed,
				EXTRACT(EPOCH FROM (now() - MIN(created_at) FILTER (WHERE published_at IS NULL AND failed_at IS NULL)))::int AS oldest_pending_seconds
			FROM outbox_events`),
	);
	return {
		pending: row?.pending ?? 0,
		failed: row?.failed ?? 0,
		oldestPendingSeconds: row?.oldest_pending_seconds ?? null,
	};
}
