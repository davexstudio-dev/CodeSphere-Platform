/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { cadev2026 } from "./cadev";

describe("CADEV 2026 seed data", () => {
	test("closes submissions on 15 November at 17:00 GMT (moved from 25 October on 19 October)", () => {
		const close = cadev2026.milestones.find(
			(m) => m.key === "submission_close",
		);
		expect(close?.startsAt.toISOString()).toBe("2026-11-15T17:00:00.000Z");
	});

	test("is open to francophone and English-speaking developers", () => {
		expect(cadev2026.summary).toContain("anglophones");
	});

	test("lists its Milestones in chronological order with unique keys", () => {
		const starts = cadev2026.milestones.map((m) => m.startsAt.getTime());
		expect(starts).toEqual([...starts].sort((a, b) => a - b));
		const keys = cadev2026.milestones.map((m) => m.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	test("weights its judging criteria to 100 %", () => {
		const total = cadev2026.criteria.reduce((sum, c) => sum + c.weight, 0);
		expect(total).toBe(100);
	});

	test("ends every ranged Milestone after it starts", () => {
		for (const m of cadev2026.milestones) {
			if (m.endsAt) {
				expect(m.endsAt.getTime()).toBeGreaterThan(m.startsAt.getTime());
			}
		}
	});
});
