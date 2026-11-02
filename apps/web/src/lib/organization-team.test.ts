import { describe, expect, test } from "bun:test";

import { memberIdFrom } from "./organization-team";

describe("memberIdFrom", () => {
	test("takes a bare id", () => {
		expect(memberIdFrom("  abc123 ")).toBe("abc123");
	});

	test("takes the last segment of a profile address", () => {
		expect(
			memberIdFrom("https://codesphereplatform.xyz/members/abc_123/?x=1#top"),
		).toBe("abc_123");
	});

	test("refuses what cannot be an id", () => {
		expect(memberIdFrom("")).toBe("");
		expect(memberIdFrom("two words")).toBe("");
		expect(memberIdFrom("https://example.org/")).toBe("");
	});
});
