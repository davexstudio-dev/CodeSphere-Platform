/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import {
	daysLeft,
	mayManage,
	offerableRoles,
	parseInviteEmails,
	rolesTo,
	staffGroup,
} from "./admin-staff";

describe("parseInviteEmails", () => {
	test("reads commas, semicolons, spaces and lines, lowercased and deduplicated", () => {
		const out = parseInviteEmails(
			"Awa@Example.com, koffi@example.com;\nmoussa@example.com  awa@example.com",
		);
		expect(out.valid).toEqual([
			"awa@example.com",
			"koffi@example.com",
			"moussa@example.com",
		]);
		expect(out.invalid).toEqual([]);
	});

	test("sets aside what is not an email", () => {
		const out = parseInviteEmails("awa@example.com, not-an-email, @x.com");
		expect(out.valid).toEqual(["awa@example.com"]);
		expect(out.invalid).toEqual(["not-an-email", "@x.com"]);
	});

	test("keeps 20 and reports the rest", () => {
		const text = Array.from({ length: 23 }, (_, i) => `u${i}@example.com`).join(
			"\n",
		);
		const out = parseInviteEmails(text);
		expect(out.valid).toHaveLength(20);
		expect(out.overflow).toEqual([
			"u20@example.com",
			"u21@example.com",
			"u22@example.com",
		]);
	});

	test("an empty form has nothing", () => {
		expect(parseInviteEmails("  \n ")).toEqual({
			valid: [],
			invalid: [],
			overflow: [],
		});
	});
});

describe("offerableRoles", () => {
	test("an admin and a super admin may offer moderator and admin, never super admin", () => {
		expect(offerableRoles("admin")).toEqual(["moderator", "admin"]);
		expect(offerableRoles("super_admin")).toEqual(["moderator", "admin"]);
	});

	test("a moderator or a member offers nothing", () => {
		expect(offerableRoles("moderator")).toEqual([]);
		expect(offerableRoles("member")).toEqual([]);
	});
});

describe("rolesTo", () => {
	test("an admin moves a moderator to member or admin, not to super admin", () => {
		expect(
			rolesTo("admin", { id: "m", role: "moderator" }, "me").sort(),
		).toEqual(["admin", "member"]);
	});

	test("an admin cannot touch a peer or a super admin", () => {
		expect(rolesTo("admin", { id: "p", role: "admin" }, "me")).toEqual([]);
		expect(rolesTo("admin", { id: "s", role: "super_admin" }, "me")).toEqual(
			[],
		);
	});

	test("a super admin reaches every other role, but never their own", () => {
		expect(
			rolesTo("super_admin", { id: "p", role: "admin" }, "me").sort(),
		).toEqual(["member", "moderator", "super_admin"]);
		expect(
			rolesTo("super_admin", { id: "me", role: "super_admin" }, "me"),
		).toEqual([]);
	});
});

describe("staffGroup", () => {
	test("groups by role, highest first", () => {
		expect(staffGroup("super_admin")).toBe("super_admin");
		expect(staffGroup("admin")).toBe("admin");
		expect(staffGroup("moderator")).toBe("moderator");
	});
});

describe("mayManage", () => {
	test("only a strictly lower rank, never oneself", () => {
		expect(mayManage("admin", { id: "m", role: "moderator" }, "me")).toEqual({
			ok: true,
		});
		expect(mayManage("admin", { id: "p", role: "admin" }, "me")).toEqual({
			ok: false,
			reason: "rank",
		});
		expect(mayManage("admin", { id: "me", role: "moderator" }, "me")).toEqual({
			ok: false,
			reason: "self",
		});
	});
});

describe("daysLeft", () => {
	const now = new Date("2026-10-27T12:00:00.000Z");
	test("rounds up and goes to zero or below once expired", () => {
		expect(daysLeft("2026-11-03T12:00:00.000Z", now)).toBe(7);
		expect(daysLeft("2026-10-28T00:00:00.000Z", now)).toBe(1);
		expect(daysLeft("2026-10-27T12:00:00.000Z", now)).toBe(0);
		expect(daysLeft("2026-10-26T12:00:00.000Z", now)).toBe(-1);
	});
});
