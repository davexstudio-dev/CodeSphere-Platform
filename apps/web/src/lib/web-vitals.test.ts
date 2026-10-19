/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { shouldReport, vitalBody } from "./web-vitals";

describe("vitalBody", () => {
	test("is the name and the value, and nothing the library also hands over", () => {
		const body = vitalBody({
			name: "LCP",
			value: 1234.5,
			// What web-vitals puts on a metric besides: ids, entries (with URLs), navigation type.
			...({
				id: "v5-123",
				navigationType: "navigate",
				entries: [{ url: "/x?token=1" }],
			} as object),
		} as { name: string; value: number });
		expect(JSON.parse(body)).toEqual({ name: "LCP", value: 1234.5 });
		expect(body).not.toContain("token");
		expect(body).not.toContain("v5-123");
	});
});

describe("shouldReport", () => {
	test("only a real browser in production that has not asked not to be tracked", () => {
		expect(shouldReport({ production: true })).toBe(true);
		expect(shouldReport({ production: false })).toBe(false);
		expect(shouldReport({ production: true, webdriver: true })).toBe(false);
		expect(shouldReport({ production: true, doNotTrack: "1" })).toBe(false);
		expect(shouldReport({ production: true, doNotTrack: "0" })).toBe(true);
		expect(shouldReport({ production: true, doNotTrack: null })).toBe(true);
	});
});
