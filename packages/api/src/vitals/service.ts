import type { WebVitalMetric } from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import { webVitals } from "@codesphere/db/schema/vitals";
import { and, gte, lt, sql } from "drizzle-orm";

import { type BucketCounts, bucketOf, goodShare, p75 } from "./buckets";

const DAY_MS = 86_400_000;
/** Aggregates older than this are deleted: the table is for trends, not history. */
export const RETENTION_DAYS = 90;
// About one report in two hundred also purges, so no scheduler is needed.
const PURGE_ODDS = 0.005;

const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10);

/**
 * The country of a request, from Cloudflare's `CF-IPCountry` header. Anything that is not two
 * letters, and Cloudflare's markers for unknown (`XX`) and Tor (`T1`), is "XX". The IP itself is
 * never read.
 */
export function countryOf(header: string | null | undefined): string {
	const code = header?.trim().toUpperCase() ?? "";
	return /^[A-Z]{2}$/.test(code) && code !== "T1" ? code : "XX";
}

/** Counts one measurement: an atomic increment of its day/country/metric/bucket counter. */
export async function recordWebVital(
	db: Database,
	report: { metric: WebVitalMetric; value: number; country: string },
	now: () => number = Date.now,
	random: () => number = Math.random,
) {
	await db
		.insert(webVitals)
		.values({
			day: utcDay(now()),
			country: report.country,
			metric: report.metric,
			bucket: bucketOf(report.metric, report.value),
			samples: 1,
		})
		.onConflictDoUpdate({
			target: [
				webVitals.day,
				webVitals.country,
				webVitals.metric,
				webVitals.bucket,
			],
			set: { samples: sql`${webVitals.samples} + 1` },
		});
	if (random() < PURGE_ODDS) {
		await db
			.delete(webVitals)
			.where(lt(webVitals.day, utcDay(now() - RETENTION_DAYS * DAY_MS)))
			.catch(() => undefined);
	}
}

/** The vitals of every country over the last `days` days (today included), most sampled first. */
export async function webVitalsByCountry(
	db: Database,
	days: number,
	now: () => number = Date.now,
) {
	const rows = await db
		.select({
			country: webVitals.country,
			metric: webVitals.metric,
			bucket: webVitals.bucket,
			samples: sql<number>`SUM(${webVitals.samples})::int`,
		})
		.from(webVitals)
		.where(and(gte(webVitals.day, utcDay(now() - (days - 1) * DAY_MS))))
		.groupBy(webVitals.country, webVitals.metric, webVitals.bucket);

	const byCountry = new Map<string, Map<WebVitalMetric, Map<number, number>>>();
	for (const row of rows) {
		const metrics = byCountry.get(row.country) ?? new Map();
		const buckets: Map<number, number> = metrics.get(row.metric) ?? new Map();
		buckets.set(row.bucket, row.samples);
		metrics.set(row.metric, buckets);
		byCountry.set(row.country, metrics);
	}
	const countries = [...byCountry.entries()].map(([country, metrics]) => ({
		country,
		metrics: [...metrics.entries()].map(
			([metric, counts]: [WebVitalMetric, BucketCounts]) => ({
				metric,
				samples: [...counts.values()].reduce((sum, n) => sum + n, 0),
				p75: p75(metric, counts),
				goodShare: goodShare(metric, counts),
			}),
		),
	}));
	const total = (c: (typeof countries)[number]) =>
		Math.max(0, ...c.metrics.map((m) => m.samples));
	countries.sort(
		(a, b) => total(b) - total(a) || a.country.localeCompare(b.country),
	);
	return { days, countries };
}
