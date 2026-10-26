/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { auditActionMessageKey, auditTargetPath } from "./audit-target";

describe("auditTargetPath", () => {
	test("leads each admin target to its screen", () => {
		expect(auditTargetPath("member", "u1")).toBe("/admin");
		expect(auditTargetPath("agent", "a1")).toBe("/admin");
		expect(auditTargetPath("tag", "t1")).toBe("/admin/tags");
		expect(auditTargetPath("milestone", "m1")).toBe("/admin/hackathons");
		expect(auditTargetPath("watch_item", "w1")).toBe("/admin/watch");
		expect(auditTargetPath("social_post", "p1")).toBe("/admin/social");
	});

	test("a Question opens its public page", () => {
		expect(String(auditTargetPath("question", "q 1"))).toBe("/questions/q%201");
		expect(auditTargetPath("question", null)).toBeNull();
	});

	test("has no link for an Answer, an unknown or a missing type", () => {
		expect(auditTargetPath("answer", "x")).toBeNull();
		expect(auditTargetPath("whatever", "x")).toBeNull();
		expect(auditTargetPath(undefined, "x")).toBeNull();
	});
});

describe("auditActionMessageKey", () => {
	test("turns dots into underscores", () => {
		expect(auditActionMessageKey("member.set_role")).toBe(
			"actions.member_set_role",
		);
	});
});
