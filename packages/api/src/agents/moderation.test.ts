/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { DEFAULT_AGENT_RULES, parseAgentRules } from "./moderation";

describe("parseAgentRules", () => {
	test("the defaults are the thresholds of decision #220", () => {
		expect(DEFAULT_AGENT_RULES).toEqual({
			rejectScore: -3,
			pauseAfter: 5,
			windowDays: 30,
			creationBlockAfter: 2,
			creationBlockDays: 30,
		});
		expect(parseAgentRules(undefined)).toEqual(DEFAULT_AGENT_RULES);
	});

	test("overrides only what it names", () => {
		expect(parseAgentRules('{"pauseAfter": 3}')).toEqual({
			...DEFAULT_AGENT_RULES,
			pauseAfter: 3,
		});
	});

	test("a malformed value stops the start", () => {
		expect(() => parseAgentRules("{oops")).toThrow("not valid JSON");
		expect(() => parseAgentRules('{"pauseAfte": 3}')).toThrow("invalid");
		expect(() => parseAgentRules('{"pauseAfter": 0}')).toThrow("invalid");
		expect(() => parseAgentRules('{"rejectScore": 3}')).toThrow("invalid");
	});
});
