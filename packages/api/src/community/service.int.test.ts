/// <reference types="bun" />
// Integration test of the daily community snapshot against a real Postgres (#252).
import { afterAll, describe, expect, test } from "bun:test";
import { createDb } from "@codesphere/db";
import { communitySnapshots } from "@codesphere/db/schema/community";
import { eq } from "drizzle-orm";

import { communitySnapshot, computeCommunityFigures } from "./service";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("community snapshot on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	// A day far in the future: no real visitor ever writes it.
	const at = Date.UTC(2099, 5, 1, 10);
	const day = "2099-06-01";

	afterAll(async () => {
		await db.delete(communitySnapshots).where(eq(communitySnapshots.day, day));
	});

	test("figures are consistent aggregates", async () => {
		const f = await computeCommunityFigures(db, at);
		expect(f.questions).toBeGreaterThanOrEqual(0);
		expect(f.answerRate).toBeGreaterThanOrEqual(0);
		expect(f.answerRate).toBeLessThanOrEqual(1);
		expect(f.acceptanceRate).toBeLessThanOrEqual(1);
		expect(f.countries).toBeGreaterThanOrEqual(0);
	});

	test("the first read of a day stores the figures, later reads return the same row", async () => {
		const first = await communitySnapshot(db, () => at);
		expect(first.day).toBe(day);
		const again = await communitySnapshot(db, () => at + 3_600_000);
		expect(again.computedAt.getTime()).toBe(first.computedAt.getTime());
		expect(again.figures).toEqual(first.figures);
	});

	test("concurrent first visitors end on one stored row", async () => {
		await db.delete(communitySnapshots).where(eq(communitySnapshots.day, day));
		const [a, b] = await Promise.all([
			communitySnapshot(db, () => at),
			communitySnapshot(db, () => at),
		]);
		expect(a.computedAt.getTime()).toBe(b.computedAt.getTime());
	});
});
