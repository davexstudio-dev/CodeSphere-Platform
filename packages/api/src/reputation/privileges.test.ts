/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import {
	DEFAULT_PRIVILEGE_THRESHOLDS,
	parsePrivilegeThresholds,
} from "./privileges";

describe("parsePrivilegeThresholds", () => {
	test("the defaults are the paliers of decision #219", () => {
		expect(DEFAULT_PRIVILEGE_THRESHOLDS).toEqual({
			flag: 25,
			propose_tag_edit: 25,
			downvote: 75,
			close_vote: 150,
			edit_tags: 300,
			submit_feed_item: 25,
		});
		expect(parsePrivilegeThresholds(undefined)).toEqual(
			DEFAULT_PRIVILEGE_THRESHOLDS,
		);
		expect(parsePrivilegeThresholds("  ")).toEqual(
			DEFAULT_PRIVILEGE_THRESHOLDS,
		);
	});

	test("overrides only the thresholds it names", () => {
		expect(parsePrivilegeThresholds('{"downvote": 100, "flag": 0}')).toEqual({
			...DEFAULT_PRIVILEGE_THRESHOLDS,
			downvote: 100,
			flag: 0,
		});
	});

	test("a malformed value stops the start instead of leaving a default silently", () => {
		expect(() => parsePrivilegeThresholds("{nope")).toThrow("not valid JSON");
		expect(() => parsePrivilegeThresholds('{"downvot": 1}')).toThrow("invalid");
		expect(() => parsePrivilegeThresholds('{"downvote": -1}')).toThrow(
			"invalid",
		);
		expect(() => parsePrivilegeThresholds('{"downvote": "75"}')).toThrow(
			"invalid",
		);
		expect(() => parsePrivilegeThresholds('{"downvote": 7.5}')).toThrow(
			"invalid",
		);
		expect(() => parsePrivilegeThresholds("[]")).toThrow("invalid");
		expect(() => parsePrivilegeThresholds('{"downvote": 99999999999}')).toThrow(
			"invalid",
		);
	});
});
