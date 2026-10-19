/// <reference types="bun" />
// Web Vitals aggregation on Postgres (#251).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "@codesphere/db";
import { webVitals } from "@codesphere/db/schema/vitals";
import { inArray, like } from "drizzle-orm";

import { countryOf, recordWebVital, webVitalsByCountry } from "./service";

const url = process.env.TEST_DATABASE_URL;
const DAY = 86_400_000;

describe("countryOf", () => {
	test("keeps a two-letter country and maps everything else to XX", () => {
		expect(countryOf("bf")).toBe("BF");
		expect(countryOf(" SN ")).toBe("SN");
		for (const value of ["XX", "T1", "", "FRA", "1A", undefined, null]) {
			expect(countryOf(value)).toBe("XX");
		}
	});
});

describe.skipIf(!url)("web vitals on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	// A country code no other suite uses; the table is shared.
	const a = `Q${crypto.randomUUID().slice(0, 1).toUpperCase()}`;
	const b = `R${crypto.randomUUID().slice(0, 1).toUpperCase()}`;
	const now = Date.UTC(2026, 9, 19, 12);

	beforeAll(async () => {
		await db.delete(webVitals).where(inArray(webVitals.country, [a, b]));
	});
	afterAll(async () => {
		await db.delete(webVitals).where(inArray(webVitals.country, [a, b]));
	});

	test("counts reports by country and metric, and reports p75 and the good share", async () => {
		// Country A: 3 LCP of 400 ms (bucket <=500) and 1 of 5000 ms (<=6000); 2 CLS.
		for (const value of [400, 400, 400, 5000]) {
			await recordWebVital(db, { metric: "LCP", value, country: a }, () => now);
		}
		for (const value of [0.02, 0.4]) {
			await recordWebVital(db, { metric: "CLS", value, country: a }, () => now);
		}
		await recordWebVital(
			db,
			{ metric: "LCP", value: 3000, country: b },
			() => now,
		);

		const report = await webVitalsByCountry(db, 7, () => now);
		const mine = report.countries.filter((c) => [a, b].includes(c.country));
		const countryA = mine.find((c) => c.country === a);
		const lcp = countryA?.metrics.find((m) => m.metric === "LCP");
		// 4 samples, the 75th percentile is the 3rd: in the first bucket.
		expect(lcp).toMatchObject({ samples: 4, p75: 500, goodShare: 0.75 });
		expect(countryA?.metrics.find((m) => m.metric === "CLS")?.samples).toBe(2);
		expect(mine.find((c) => c.country === b)?.metrics[0]).toMatchObject({
			samples: 1,
			p75: 3000,
			goodShare: 0,
		});
		// Most sampled first.
		expect(mine.map((c) => c.country)).toEqual([a, b]);
	});

	test("only the last N days count", async () => {
		await recordWebVital(
			db,
			{ metric: "TTFB", value: 100, country: b },
			() => now - 10 * DAY,
		);
		const recent = await webVitalsByCountry(db, 7, () => now);
		expect(
			recent.countries
				.find((c) => c.country === b)
				?.metrics.some((m) => m.metric === "TTFB"),
		).toBe(false);
		const wide = await webVitalsByCountry(db, 30, () => now);
		expect(
			wide.countries
				.find((c) => c.country === b)
				?.metrics.some((m) => m.metric === "TTFB"),
		).toBe(true);
	});

	test("old aggregates are purged", async () => {
		await db.insert(webVitals).values({
			day: "2020-01-01",
			country: a,
			metric: "FCP",
			bucket: 0,
			samples: 5,
		});
		// random() = 0 is under the purge odds.
		await recordWebVital(
			db,
			{ metric: "FCP", value: 100, country: a },
			() => now,
			() => 0,
		);
		const left = await db
			.select()
			.from(webVitals)
			.where(like(webVitals.day, "2020-%"));
		expect(left.filter((r) => r.country === a)).toEqual([]);
	});

	test("stores nothing but day, country, metric, bucket and a counter", async () => {
		const [row] = await db
			.select()
			.from(webVitals)
			.where(inArray(webVitals.country, [a]));
		expect(Object.keys(row ?? {}).sort()).toEqual([
			"bucket",
			"country",
			"day",
			"metric",
			"samples",
		]);
	});
});
