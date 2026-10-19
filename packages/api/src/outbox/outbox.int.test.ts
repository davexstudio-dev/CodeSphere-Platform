/// <reference types="bun" />
// Integration test of the outbox (#259) against a real Postgres: nothing lost, nothing applied twice
// across failures, a crash between the send and the mark, two relays at once, and a restart.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { user } from "@codesphere/db/schema/auth";
import { organization } from "@codesphere/db/schema/organizations";
import {
	outboxEvents,
	outboxStats,
	processedEvents,
} from "@codesphere/db/schema/outbox";
import { eq, inArray, like, sql } from "drizzle-orm";

import { withAudit } from "../audit";
import { type Consumer, deliver, localQueue } from "./consumer";
import { statsConsumer } from "./consumers";
import { outboxInsert, publishEvent } from "./events";
import {
	backoffMs,
	drainOutbox,
	type EventQueue,
	markConsumerFailed,
	outboxStatus,
	type QueueMessage,
} from "./relay";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("outbox on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID().slice(0, 8);
	const type = (name: string) => `it.${run}.${name}`;
	const actor = `it-outbox-${run}`;
	const mine = (message: QueueMessage) => message.type.startsWith(`it.${run}.`);

	/** A queue that records what it was given. */
	const recorder = () => {
		const seen: QueueMessage[] = [];
		const queue: EventQueue = {
			async sendBatch(messages) {
				seen.push(...messages);
			},
		};
		return { seen, queue };
	};

	beforeAll(async () => {
		await db
			.insert(user)
			.values({ id: actor, name: "Outbox", email: `${actor}@example.com` });
	});

	afterAll(async () => {
		const ids = (
			await db
				.select({ id: outboxEvents.id })
				.from(outboxEvents)
				.where(like(outboxEvents.type, `it.${run}.%`))
		).map((r) => r.id);
		if (ids.length) {
			await db
				.delete(processedEvents)
				.where(inArray(processedEvents.eventId, ids));
		}
		await db.delete(outboxEvents).where(like(outboxEvents.type, `it.${run}.%`));
		await db.delete(outboxStats).where(like(outboxStats.type, `it.${run}.%`));
		await db
			.delete(organization)
			.where(like(organization.slug, `outbox-${run}%`));
		await db.delete(auditLog).where(eq(auditLog.actorId, actor));
		await db.delete(user).where(eq(user.id, actor));
	});

	test("an event is written in the same statement as the change, or not at all", async () => {
		const slug = `outbox-${run}-a`;
		const rows = await withAudit(
			db,
			{
				actorId: actor,
				action: "it.outbox",
				targetType: "organization",
				targetIdColumn: "id",
			},
			db
				.insert(organization)
				.values({
					slug,
					name: "Outbox A",
					website: "https://a.example.org",
					country: "SN",
				})
				.returning({ id: organization.id }),
			[
				outboxInsert({
					type: type("created"),
					aggregateType: "organization",
					aggregateIdColumn: "id",
					payload: { slug },
				}),
			],
		);
		const id = rows[0]?.id as string;
		const [event] = await db
			.select()
			.from(outboxEvents)
			.where(eq(outboxEvents.type, type("created")));
		expect(event).toMatchObject({
			aggregateType: "organization",
			aggregateId: id,
			payload: { slug },
			publishedAt: null,
		});

		// A mutation that matches nothing emits nothing.
		await withAudit(
			db,
			{
				actorId: actor,
				action: "it.outbox.none",
				targetType: "organization",
				targetIdColumn: "id",
			},
			db
				.update(organization)
				.set({ name: "x" })
				.where(eq(organization.slug, "does-not-exist"))
				.returning({ id: organization.id }),
			[
				outboxInsert({
					type: type("none"),
					aggregateType: "organization",
					aggregateIdColumn: "id",
				}),
			],
		);
		expect(
			await db
				.select()
				.from(outboxEvents)
				.where(eq(outboxEvents.type, type("none"))),
		).toEqual([]);
	});

	test("emitting twice with the same key writes once", async () => {
		const event = {
			type: type("dedupe"),
			aggregateType: "x",
			aggregateId: "1",
			dedupeKey: `it-${run}-dedupe`,
		};
		await publishEvent(db, event);
		await publishEvent(db, event);
		expect(
			await db
				.select()
				.from(outboxEvents)
				.where(eq(outboxEvents.type, type("dedupe"))),
		).toHaveLength(1);
	});

	test("every event is sent once, in order, whatever the batch size", async () => {
		for (let i = 0; i < 10; i++) {
			await publishEvent(db, {
				type: type("ordered"),
				aggregateType: "n",
				aggregateId: String(i),
			});
		}
		const { seen, queue } = recorder();
		// Other tests leave events of their own in the table: drain until the table is empty.
		for (let i = 0; i < 100; i++) {
			const { claimed } = await drainOutbox(db, queue, { batchSize: 4 });
			if (claimed === 0) break;
		}
		const ordered = seen.filter((m) => m.type === type("ordered"));
		expect(ordered.map((m) => m.aggregateId)).toEqual([
			"0",
			"1",
			"2",
			"3",
			"4",
			"5",
			"6",
			"7",
			"8",
			"9",
		]);
		expect(new Set(ordered.map((m) => m.id)).size).toBe(10);
		const pending = await db
			.select()
			.from(outboxEvents)
			.where(
				sql`${outboxEvents.type} = ${type("ordered")} AND ${outboxEvents.publishedAt} IS NULL`,
			);
		expect(pending).toEqual([]);
	});

	test("a failing queue loses nothing: the events wait, back off, and go out once it recovers", async () => {
		await publishEvent(db, {
			type: type("retry"),
			aggregateType: "n",
			aggregateId: "r1",
		});
		await publishEvent(db, {
			type: type("retry"),
			aggregateType: "n",
			aggregateId: "r2",
		});
		const down: EventQueue = {
			async sendBatch() {
				throw new Error("queue unavailable");
			},
		};
		let now = Date.now();
		const first = await drainOutbox(db, down, { now: () => now });
		expect(first.failed).toBeGreaterThanOrEqual(2);
		const [waiting] = await db
			.select()
			.from(outboxEvents)
			.where(eq(outboxEvents.aggregateId, "r1"));
		expect(waiting).toMatchObject({
			publishedAt: null,
			attempts: 1,
			lastError: "queue unavailable",
		});

		// Still inside its backoff: not claimed again.
		const { seen, queue } = recorder();
		await drainOutbox(db, queue, { now: () => now + 100 });
		expect(seen.some((m) => m.aggregateId === "r1")).toBe(false);
		// After the backoff, the queue is back: both events go out, once.
		now += backoffMs(1) + 1000;
		await drainOutbox(db, queue, { now: () => now });
		expect(
			seen
				.filter((m) => m.type === type("retry"))
				.map((m) => m.aggregateId)
				.sort(),
		).toEqual(["r1", "r2"]);
	});

	test("two relays at once never send the same event twice", async () => {
		for (let i = 0; i < 12; i++) {
			await publishEvent(db, {
				type: type("race"),
				aggregateType: "n",
				aggregateId: String(i),
			});
		}
		const { seen, queue } = recorder();
		await Promise.all([
			drainOutbox(db, queue, { batchSize: 6 }),
			drainOutbox(db, queue, { batchSize: 6 }),
			drainOutbox(db, queue, { batchSize: 6 }),
		]);
		await drainOutbox(db, queue, { batchSize: 50 });
		const raced = seen.filter((m) => m.type === type("race")).map((m) => m.id);
		expect(raced).toHaveLength(12);
		expect(new Set(raced).size).toBe(12);
	});

	test("a relay that died holding events frees them when its lease ends: sent again, applied once", async () => {
		await publishEvent(db, {
			type: type("crash"),
			aggregateType: "n",
			aggregateId: "c1",
		});
		// The relay delivers to a consumer and dies before marking the event published.
		const crashing: EventQueue = {
			async sendBatch(messages) {
				await localQueue(db, [statsConsumer]).sendBatch(messages.filter(mine));
				throw new Error("process killed");
			},
		};
		const t0 = Date.now();
		await drainOutbox(db, crashing, { now: () => t0, leaseMs: 60_000 });
		const [held] = await db
			.select()
			.from(outboxEvents)
			.where(eq(outboxEvents.aggregateId, "c1"));
		expect(held?.publishedAt).toBeNull();

		// A restarted relay: inside the lease and the backoff nothing moves; after, the event is sent again.
		const { seen, queue } = recorder();
		await drainOutbox(db, queue, { now: () => t0 + 500 });
		expect(seen.some((m) => m.aggregateId === "c1")).toBe(false);
		const redelivery: EventQueue = {
			async sendBatch(messages) {
				seen.push(...messages);
				await localQueue(db, [statsConsumer]).sendBatch(messages.filter(mine));
			},
		};
		await drainOutbox(db, redelivery, { now: () => t0 + 120_000 });
		expect(seen.filter((m) => m.aggregateId === "c1")).toHaveLength(1);

		// Delivered twice to the consumer, counted once.
		const [stat] = await db
			.select()
			.from(outboxStats)
			.where(eq(outboxStats.type, type("crash")));
		expect(stat?.count).toBe(1);
	});

	test("a consumer never applies the same event twice, and a failing one is retried alone", async () => {
		const message: QueueMessage = {
			id: crypto.randomUUID(),
			type: type("consume"),
			aggregateType: "n",
			aggregateId: "k",
			payload: {},
			createdAt: new Date().toISOString(),
		};
		let calls = 0;
		let failOnce = true;
		const counting: Consumer = {
			name: `it-${run}-counting`,
			types: [type("consume")],
			async handle() {
				calls++;
			},
		};
		const flaky: Consumer = {
			name: `it-${run}-flaky`,
			types: "*",
			async handle() {
				if (failOnce) {
					failOnce = false;
					throw new Error("boom");
				}
			},
		};
		await expect(
			deliver(db, [counting, flaky], message),
		).rejects.toBeInstanceOf(AggregateError);
		const retry = await deliver(db, [counting, flaky], message);
		expect(retry).toEqual({ handled: [flaky.name], skipped: [counting.name] });
		await deliver(db, [counting, flaky], message);
		expect(calls).toBe(1);
		await db
			.delete(processedEvents)
			.where(eq(processedEvents.eventId, message.id));
	});

	test("an event that keeps failing is given up and shows in the status", async () => {
		await publishEvent(db, {
			type: type("dead"),
			aggregateType: "n",
			aggregateId: "d1",
		});
		const down: EventQueue = {
			async sendBatch() {
				throw new Error("nope");
			},
		};
		let now = Date.now();
		for (let i = 0; i < 3; i++) {
			await drainOutbox(db, down, { now: () => now, maxAttempts: 3 });
			now += 400_000;
		}
		await drainOutbox(db, down, { now: () => now, maxAttempts: 3 });
		const [dead] = await db
			.select()
			.from(outboxEvents)
			.where(eq(outboxEvents.aggregateId, "d1"));
		expect(dead?.failedAt).not.toBeNull();
		expect((await outboxStatus(db)).failed).toBeGreaterThanOrEqual(1);
		// Never claimed again.
		const { seen, queue } = recorder();
		await drainOutbox(db, queue, { now: () => now + 10_000_000 });
		expect(seen.some((m) => m.aggregateId === "d1")).toBe(false);
	});

	test("one poison event holds back none of its neighbours", async () => {
		await publishEvent(db, {
			type: type("poison"),
			aggregateType: "n",
			aggregateId: "p0",
		});
		await publishEvent(db, {
			type: type("poison"),
			aggregateType: "n",
			aggregateId: "p1",
		});
		await publishEvent(db, {
			type: type("poison"),
			aggregateType: "n",
			aggregateId: "p2",
		});
		const handled: string[] = [];
		const consumer: Consumer = {
			name: `it-${run}-poison`,
			types: [type("poison")],
			async handle(message) {
				if (message.aggregateId === "p1") {
					throw new Error("poison");
				}
				handled.push(message.aggregateId);
			},
		};
		const queue = localQueue(db, [consumer]);
		let now = Date.now();
		const result = await drainOutbox(db, queue, { now: () => now });
		expect(handled.sort()).toEqual(["p0", "p2"]);
		expect(result.failed).toBe(1);
		const rows = await db
			.select()
			.from(outboxEvents)
			.where(eq(outboxEvents.type, type("poison")));
		expect(
			rows
				.filter((r) => r.publishedAt)
				.map((r) => r.aggregateId)
				.sort(),
		).toEqual(["p0", "p2"]);
		expect(rows.find((r) => r.aggregateId === "p1")).toMatchObject({
			publishedAt: null,
			attempts: 1,
		});
		await db
			.delete(processedEvents)
			.where(eq(processedEvents.consumer, consumer.name));
		now += 1;
	});

	test("an atomic consumer that forgets its marker is refused, and a consumer's final failure shows in the status", async () => {
		const message: QueueMessage = {
			id: crypto.randomUUID(),
			type: type("atomic"),
			aggregateType: "n",
			aggregateId: "a",
			payload: {},
			createdAt: new Date().toISOString(),
		};
		const careless: Consumer = {
			name: `it-${run}-careless`,
			types: "*",
			atomic: true,
			async handle() {},
		};
		await expect(deliver(db, [careless], message)).rejects.toBeInstanceOf(
			AggregateError,
		);

		await publishEvent(db, {
			type: type("final"),
			aggregateType: "n",
			aggregateId: "f1",
		});
		const { seen, queue } = recorder();
		for (let i = 0; i < 100; i++) {
			if ((await drainOutbox(db, queue, { batchSize: 50 })).claimed === 0)
				break;
		}
		const sent = seen.find((m) => m.aggregateId === "f1");
		const before = (await outboxStatus(db)).failed;
		await markConsumerFailed(db, sent?.id ?? "", "consumer gave up");
		expect((await outboxStatus(db)).failed).toBe(before + 1);
	});
});
