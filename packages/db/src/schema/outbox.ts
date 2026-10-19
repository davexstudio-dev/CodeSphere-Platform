import {
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

// The outbox (#259, ADR 0001): an event is written in the same statement as the change it
// describes (the edge database has no interactive transactions, so one statement is the atomic
// unit), then a relay drains the table into Cloudflare Queues. Delivery is at least once; the
// consumers are idempotent.

export const outboxEvents = pgTable(
	"outbox_events",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		// `<entity>.<verb>`: organization.validated, job.uphold...
		type: text("type").notNull(),
		// What the event is about, so a consumer can fetch the current state instead of trusting a payload.
		aggregateType: text("aggregate_type").notNull(),
		aggregateId: text("aggregate_id").notNull(),
		payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
		// Emitting twice with the same key writes once (a retried request does not duplicate the event).
		dedupeKey: text("dedupe_key").unique(),
		createdAt: timestamp("created_at", { precision: 6 }).defaultNow().notNull(),
		// Set once the queue accepted the event.
		publishedAt: timestamp("published_at", { precision: 3 }),
		// The relay that claimed the event holds it until then: a crashed relay frees it by timeout.
		lockedUntil: timestamp("locked_until", { precision: 3 }),
		attempts: integer("attempts").default(0).notNull(),
		lastError: text("last_error"),
		// Given up after too many attempts: kept for an Admin, never claimed again.
		failedAt: timestamp("failed_at", { precision: 3 }),
	},
	(t) => [
		index("outbox_events_pending_idx").on(t.publishedAt, t.createdAt, t.id),
		index("outbox_events_aggregate_idx").on(t.aggregateType, t.aggregateId),
	],
);

// What each consumer already handled: the second delivery of an event is recognised and skipped.
export const processedEvents = pgTable(
	"processed_events",
	{
		consumer: text("consumer").notNull(),
		eventId: uuid("event_id").notNull(),
		processedAt: timestamp("processed_at", { precision: 3 }).defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.consumer, t.eventId] })],
);

// The demonstration consumer's output (docs/outbox.md): how many events of each type it saw.
export const outboxStats = pgTable("outbox_stats", {
	type: text("type").primaryKey(),
	count: integer("count").default(0).notNull(),
	updatedAt: timestamp("updated_at", { precision: 3 }).defaultNow().notNull(),
});

export const OUTBOX_MAX_ATTEMPTS = 8;
