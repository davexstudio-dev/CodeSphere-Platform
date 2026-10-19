import type { WebVitalMetric } from "@codesphere/contract";

// Value buckets of the Web Vitals aggregation (#251). A report is counted in the first bucket whose
// upper edge it does not exceed; a value over the last edge goes in the overflow bucket. The edges
// include the "good" threshold of each metric (web.dev), so the share within it is exact. Values are
// milliseconds, except CLS (unitless).
export const BUCKET_EDGES: Record<WebVitalMetric, readonly number[]> = {
	LCP: [500, 1000, 1500, 2000, 2500, 3000, 4000, 6000, 10000],
	INP: [50, 100, 150, 200, 300, 500, 800, 1200],
	CLS: [0.01, 0.05, 0.1, 0.15, 0.25, 0.5, 1],
	FCP: [500, 1000, 1500, 1800, 2400, 3000, 4500, 7000],
	TTFB: [200, 400, 600, 800, 1200, 1800, 3000, 5000],
};

/** The upper limit of "good" for each metric. */
export const GOOD_THRESHOLD: Record<WebVitalMetric, number> = {
	LCP: 2500,
	INP: 200,
	CLS: 0.1,
	FCP: 1800,
	TTFB: 800,
};

/** The bucket a value falls in: its index among the edges, or `edges.length` (overflow). */
export function bucketOf(metric: WebVitalMetric, value: number): number {
	const edges = BUCKET_EDGES[metric];
	const index = edges.findIndex((edge) => value <= edge);
	return index === -1 ? edges.length : index;
}

/** The upper edge of a bucket; null for the overflow bucket, which has none. */
export function upperEdge(
	metric: WebVitalMetric,
	bucket: number,
): number | null {
	return BUCKET_EDGES[metric][bucket] ?? null;
}

export type BucketCounts = ReadonlyMap<number, number>;

/**
 * The 75th percentile as the upper edge of the bucket that holds it: an overestimate by less than
 * one bucket, so a metric is never reported better than it is. Null with no sample, or when the 75th
 * percentile is in the overflow bucket.
 */
export function p75(
	metric: WebVitalMetric,
	counts: BucketCounts,
): number | null {
	const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
	if (total === 0) {
		return null;
	}
	let seen = 0;
	for (const bucket of [...counts.keys()].sort((a, b) => a - b)) {
		seen += counts.get(bucket) ?? 0;
		if (seen >= total * 0.75) {
			return upperEdge(metric, bucket);
		}
	}
	return null;
}

/** The share of samples at or under the "good" threshold, 0 to 1 (0 with no sample). */
export function goodShare(
	metric: WebVitalMetric,
	counts: BucketCounts,
): number {
	const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
	if (total === 0) {
		return 0;
	}
	let good = 0;
	for (const [bucket, n] of counts) {
		const edge = upperEdge(metric, bucket);
		if (edge !== null && edge <= GOOD_THRESHOLD[metric]) {
			good += n;
		}
	}
	return good / total;
}
