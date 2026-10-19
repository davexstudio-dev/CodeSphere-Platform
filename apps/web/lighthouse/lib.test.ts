/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import {
	assertions,
	blockingFailures,
	ChallengedError,
	config,
	evaluate,
	pickUrls,
	renderReport,
	sizeBudgets,
} from "./lib.cjs";

const BEFORE = Date.parse("2026-10-20T00:00:00Z");
const AFTER = Date.parse("2026-11-02T00:00:00Z");

describe("budgets", () => {
	test("LCP and initial JS block from the start, the others only after the warning period", () => {
		const early = assertions(BEFORE);
		expect(early["largest-contentful-paint"][0]).toBe("error");
		expect(early["total-blocking-time"][0]).toBe("warn");
		expect(early["cumulative-layout-shift"][0]).toBe("warn");
		expect(sizeBudgets(BEFORE).script.level).toBe("error");
		expect(sizeBudgets(BEFORE).total.level).toBe("warn");

		for (const [level] of Object.values(assertions(AFTER))) {
			expect(level).toBe("error");
		}
		expect(sizeBudgets(AFTER).total.level).toBe("error");
	});

	test("carries the thresholds of map #224, timings on the median run", () => {
		const budgets = assertions(AFTER);
		expect(budgets["largest-contentful-paint"][1]).toEqual({
			maxNumericValue: 2500,
			aggregationMethod: "median",
		});
		expect(budgets["total-blocking-time"][1].maxNumericValue).toBe(200);
		expect(budgets["cumulative-layout-shift"][1].maxNumericValue).toBe(0.1);
		expect(sizeBudgets(AFTER).script.max).toBe(150 * 1024);
		expect(sizeBudgets(AFTER).total.max).toBe(300 * 1024);
	});

	test("audits the mobile profile and refuses to run without pages", () => {
		const { ci } = config({ LHCI_URLS: "http://a/, http://a/ask" }, BEFORE);
		expect(ci.collect.url).toEqual(["http://a/", "http://a/ask"]);
		expect(ci.collect.settings.formFactor).toBe("mobile");
		expect(ci.collect.settings.throttling.cpuSlowdownMultiplier).toBe(4);
		expect(() => config({}, BEFORE)).toThrow("LHCI_URLS");
	});
});

const ok = (body: unknown) => ({ status: 200, challenged: false, body });

describe("pickUrls", () => {
	test("adds the first Question and Hackathon the preview serves", async () => {
		const urls = await pickUrls("https://pr-1.example/", async (url: string) =>
			url.includes("/questions")
				? ok({ items: [{ id: "q 1" }] })
				: url.includes("/hackathons")
					? ok({ items: [{ slug: "cadev-2026" }] })
					: ok(null),
		);
		expect(urls).toEqual([
			"https://pr-1.example/",
			"https://pr-1.example/ask",
			"https://pr-1.example/roadmap",
			"https://pr-1.example/questions/q%201",
			"https://pr-1.example/hackathons/cadev-2026",
		]);
	});

	test("says which page it leaves out instead of dropping it silently", async () => {
		const warnings: string[] = [];
		const urls = await pickUrls(
			"https://pr-1.example",
			async () => {
				throw new Error("down");
			},
			(message: string) => warnings.push(message),
		);
		expect(urls).toEqual([
			"https://pr-1.example/",
			"https://pr-1.example/ask",
			"https://pr-1.example/roadmap",
		]);
		expect(warnings).toHaveLength(2);
		expect(warnings[0]).toContain("question");
		expect(warnings[1]).toContain("hackathon");
	});

	test("stops when Cloudflare challenges the runner", async () => {
		await expect(
			pickUrls("https://pr-1.example", async () => ({
				status: 403,
				challenged: true,
				body: null,
			})),
		).rejects.toBeInstanceOf(ChallengedError);
	});
});

describe("evaluate and renderReport", () => {
	const audits = (
		lcp: number | undefined,
		js: number | undefined,
		total = 250 * 1024,
	) => ({
		"largest-contentful-paint": { numericValue: lcp },
		"total-blocking-time": { numericValue: 100 },
		"cumulative-layout-shift": { numericValue: 0.02 },
		"resource-summary": {
			details: {
				items: [
					{ resourceType: "script", size: 900 * 1024, transferSize: js },
					{ resourceType: "total", transferSize: total },
				],
			},
		},
	});

	test("weighs compressed bytes, not the uncompressed size lhci would count", () => {
		// 900 KB of script on disk, 100 KB on the wire: within the 150 KB budget.
		const [row] = evaluate(
			[{ url: "https://x/", audits: audits(2000, 100 * 1024) }],
			AFTER,
		);
		expect(row.js.ok).toBe(true);
		expect(blockingFailures([row])).toEqual([]);
	});

	test("marks each metric against its budget and tells blocking from warning", () => {
		const runs = [
			{ url: "https://x/", audits: audits(2000, 100 * 1024) },
			{ url: "https://x/ask", audits: audits(3000, 200 * 1024, 400 * 1024) },
		];
		const [home, ask] = renderReport(runs, BEFORE)
			.split("\n")
			.filter((l) => l.startsWith("| `"));
		expect(home).toContain("✅ 2.00 s");
		expect(home).toContain("✅ 100 KB");
		expect(ask).toContain("❌ 3.00 s");
		expect(ask).toContain("❌ 200 KB");
		// Total weight only warns before the end of the warning period.
		expect(ask).toContain("⚠️ 400 KB");
		expect(blockingFailures(evaluate(runs, BEFORE))).toEqual([
			"/ask: lcp",
			"/ask: js",
		]);
		expect(blockingFailures(evaluate(runs, AFTER))).toContain("/ask: total");
	});

	test("a page that could not be measured fails instead of crashing the report", () => {
		const runs = [{ url: "https://x/", audits: audits(undefined, undefined) }];
		expect(renderReport(runs, BEFORE)).toContain("❌ n/a");
		expect(blockingFailures(evaluate(runs, BEFORE))).toEqual([
			"/: lcp",
			"/: js",
		]);
		expect(() =>
			renderReport([{ url: "https://x/", audits: {} }], BEFORE),
		).not.toThrow();
	});
});
