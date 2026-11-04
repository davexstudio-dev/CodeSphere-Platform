/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { FARMING_LIMITS, parseFarmingLimits } from "./farming";

describe("parseFarmingLimits", () => {
	test("the defaults are the limits of decision #219", () => {
		expect(FARMING_LIMITS).toEqual({
			dailyGainCap: 200,
			minAccountAgeDays: 7,
			repeatVoterMax: 10,
			repeatWindowDays: 30,
		});
		expect(parseFarmingLimits(undefined)).toEqual(FARMING_LIMITS);
	});

	test("overrides only what it names", () => {
		expect(parseFarmingLimits('{"minAccountAgeDays": 0}')).toEqual({
			...FARMING_LIMITS,
			minAccountAgeDays: 0,
		});
	});

	test("a malformed value stops the start", () => {
		expect(() => parseFarmingLimits("{oops")).toThrow("not valid JSON");
		expect(() => parseFarmingLimits('{"dailyCap": 1}')).toThrow("invalid");
		expect(() => parseFarmingLimits('{"repeatVoterMax": 0}')).toThrow(
			"invalid",
		);
		expect(() => parseFarmingLimits('{"dailyGainCap": -5}')).toThrow("invalid");
	});
});
