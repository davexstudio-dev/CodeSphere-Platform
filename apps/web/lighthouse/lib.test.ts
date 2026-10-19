/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { assertions, config, pickUrls, renderReport } from "./lib.cjs";

const BEFORE = Date.parse("2026-10-20T00:00:00Z");
const AFTER = Date.parse("2026-11-02T00:00:00Z");

describe("budgets", () => {
	test("LCP and initial JS block from the start, the others only after the warning period", () => {
		const early = assertions(BEFORE);
		expect(early["largest-contentful-paint"][0]).toBe("error");
		expect(early["resource-summary:script:size"][0]).toBe("error");
		expect(early["total-blocking-time"][0]).toBe("warn");
		expect(early["cumulative-layout-shift"][0]).toBe("warn");
		expect(early["resource-summary:total:size"][0]).toBe("warn");

		const late = assertions(AFTER);
		for (const [level] of Object.values(late)) expect(level).toBe("error");
	});

	test("carries the thresholds of map #224", () => {
		const budgets = assertions(AFTER);
		expect(budgets["largest-contentful-paint"][1].maxNumericValue).toBe(2500);
		expect(budgets["total-blocking-time"][1].maxNumericValue).toBe(200);
		expect(budgets["cumulative-layout-shift"][1].maxNumericValue).toBe(0.1);
		expect(budgets["resource-summary:script:size"][1].maxNumericValue).toBe(
			150 * 1024,
		);
		expect(budgets["resource-summary:total:size"][1].maxNumericValue).toBe(
			300 * 1024,
		);
	});

	test("audits the mobile profile and refuses to run without pages", () => {
		const { ci } = config({ LHCI_URLS: "http://a/, http://a/ask" }, BEFORE);
		expect(ci.collect.url).toEqual(["http://a/", "http://a/ask"]);
		expect(ci.collect.settings.formFactor).toBe("mobile");
		expect(ci.collect.settings.throttling.cpuSlowdownMultiplier).toBe(4);
		expect(() => config({}, BEFORE)).toThrow("LHCI_URLS");
	});
});

describe("pickUrls", () => {
	test("adds the first Question and Hackathon the preview serves", async () => {
		const urls = await pickUrls("https://pr-1.example/", async (url: string) =>
			url.includes("/questions")
				? { items: [{ id: "q 1" }] }
				: { items: [{ slug: "cadev-2026" }] },
		);
		expect(urls).toEqual([
			"https://pr-1.example/",
			"https://pr-1.example/ask",
			"https://pr-1.example/questions/q%201",
			"https://pr-1.example/hackathons/cadev-2026",
		]);
	});

	test("leaves out a page whose data is missing instead of faking it", async () => {
		const urls = await pickUrls("https://pr-1.example", async () => {
			throw new Error("down");
		});
		expect(urls).toEqual(["https://pr-1.example/", "https://pr-1.example/ask"]);
	});
});

describe("renderReport", () => {
	const audits = (lcp: number, js: number) => ({
		"largest-contentful-paint": { numericValue: lcp },
		"total-blocking-time": { numericValue: 100 },
		"cumulative-layout-shift": { numericValue: 0.02 },
		"resource-summary": {
			details: {
				items: [
					{ resourceType: "script", transferSize: js },
					{ resourceType: "total", transferSize: 250 * 1024 },
				],
			},
		},
	});

	test("marks each metric against its budget", () => {
		const table = renderReport(
			[
				{ url: "https://x/", audits: audits(2000, 100 * 1024) },
				{ url: "https://x/ask", audits: audits(3000, 200 * 1024) },
			],
			AFTER,
		);
		const [home, ask] = table.split("\n").filter((l) => l.startsWith("| `"));
		expect(home).toContain("✅ 2.00 s");
		expect(home).toContain("✅ 100 KB");
		expect(ask).toContain("❌ 3.00 s");
		expect(ask).toContain("❌ 200 KB");
	});
});
