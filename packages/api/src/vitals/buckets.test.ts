/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import {
	BUCKET_EDGES,
	bucketOf,
	GOOD_THRESHOLD,
	goodShare,
	p75,
	p75Above,
	upperEdge,
} from "./buckets";

describe("bucketOf", () => {
	test("counts a value in the first bucket whose edge it does not exceed", () => {
		expect(bucketOf("LCP", 0)).toBe(0);
		expect(bucketOf("LCP", 500)).toBe(0);
		expect(bucketOf("LCP", 501)).toBe(1);
		expect(bucketOf("CLS", 0.1)).toBe(2);
		expect(bucketOf("CLS", 0.1001)).toBe(3);
	});

	test("a value over the last edge is in the overflow bucket, which has no upper edge", () => {
		const overflow = BUCKET_EDGES.LCP.length;
		expect(bucketOf("LCP", 99_999)).toBe(overflow);
		expect(upperEdge("LCP", overflow)).toBeNull();
	});

	test("every metric has its good threshold among its edges, so the good share is exact", () => {
		for (const metric of ["LCP", "INP", "CLS", "FCP", "TTFB"] as const) {
			expect(BUCKET_EDGES[metric]).toContain(GOOD_THRESHOLD[metric]);
		}
	});
});

describe("p75", () => {
	const counts = (entries: [number, number][]) => new Map(entries);

	test("is the upper edge of the bucket holding the 75th percentile", () => {
		// 100 samples: 60 in bucket 0 (<=500), 20 in bucket 4 (<=2500), 20 in bucket 7 (<=6000).
		// The 75th sample is in bucket 4.
		expect(
			p75(
				"LCP",
				counts([
					[0, 60],
					[4, 20],
					[7, 20],
				]),
			),
		).toBe(2500);
	});

	test("never reports better than the truth: the edge, not the bucket's lower side", () => {
		expect(p75("LCP", counts([[2, 100]]))).toBe(1500);
	});

	test("is null with no sample, and when the percentile is in the overflow bucket", () => {
		expect(p75("LCP", counts([]))).toBeNull();
		expect(p75("LCP", counts([[9, 10]]))).toBeNull();
	});
});

describe("p75Above", () => {
	test("tells a 75th percentile off the scale from no data", () => {
		const overflow = BUCKET_EDGES.LCP.length;
		expect(p75("LCP", new Map([[overflow, 10]]))).toBeNull();
		expect(p75Above("LCP", new Map([[overflow, 10]]))).toBe(10000);
		expect(p75Above("LCP", new Map())).toBeNull();
		expect(p75Above("LCP", new Map([[0, 10]]))).toBeNull();
	});
});

describe("goodShare", () => {
	test("counts the samples at or under the good threshold", () => {
		// LCP good is <= 2500, bucket 4. 3 good (buckets 0, 4), 1 not (bucket 5).
		expect(
			goodShare(
				"LCP",
				new Map([
					[0, 2],
					[4, 1],
					[5, 1],
				]),
			),
		).toBe(0.75);
		expect(goodShare("LCP", new Map())).toBe(0);
	});
});
