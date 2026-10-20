/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { isAdminEmail, parseAdminEmails, roleFor } from "./admin";

describe("parseAdminEmails", () => {
	test("is empty when the variable is missing", () => {
		expect(parseAdminEmails(undefined).size).toBe(0);
	});

	test("splits, trims and lowercases the list", () => {
		const admins = parseAdminEmails(" Dave@Example.com , ,lamafx@example.com ");
		expect([...admins]).toEqual(["dave@example.com", "lamafx@example.com"]);
	});
});

describe("isAdminEmail", () => {
	const admins = parseAdminEmails("dave@example.com");

	test("grants admin to a listed, verified email whatever its case", () => {
		expect(isAdminEmail("Dave@Example.com", true, admins)).toBe(true);
	});

	test("refuses admin to a listed email that is not verified", () => {
		expect(isAdminEmail("dave@example.com", false, admins)).toBe(false);
	});

	test("refuses admin to an unlisted email", () => {
		expect(isAdminEmail("someone@example.com", true, admins)).toBe(false);
	});
});

describe("roleFor", () => {
	const staff = (lists: {
		superAdmins?: string;
		admins?: string;
		moderators?: string;
	}) => ({
		superAdmins: parseAdminEmails(lists.superAdmins),
		admins: parseAdminEmails(lists.admins),
		moderators: parseAdminEmails(lists.moderators),
	});
	const admins = staff({ admins: "dave@example.com" });

	test("promotes a listed, verified email at the next sign-in", () => {
		expect(
			roleFor({ email: "Dave@example.com", emailVerified: true }, admins),
		).toBe("admin");
	});

	test("demotes an email removed from the list", () => {
		expect(
			roleFor({ email: "dave@example.com", emailVerified: true }, staff({})),
		).toBe("member");
	});

	test("keeps an unverified listed email a member", () => {
		expect(
			roleFor({ email: "dave@example.com", emailVerified: false }, admins),
		).toBe("member");
	});

	test("gives each staff list its role", () => {
		const lists = staff({
			superAdmins: "other@example.com, boss@example.com",
			moderators: "mod@example.com",
		});
		const verified = (email: string) => ({ email, emailVerified: true });
		expect(roleFor(verified("boss@example.com"), lists)).toBe("super_admin");
		expect(roleFor(verified("mod@example.com"), lists)).toBe("moderator");
	});

	test("gives the highest role when an email is in several lists", () => {
		const lists = staff({
			superAdmins: "dave@example.com",
			admins: "dave@example.com",
			moderators: "dave@example.com",
		});
		expect(
			roleFor({ email: "dave@example.com", emailVerified: true }, lists),
		).toBe("super_admin");
	});
});
