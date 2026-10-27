/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { isAdminEmail, parseAdminEmails, roleAtSignIn, roleFor } from "./admin";
import { roleFromInvitation } from "./staff-invitation";

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

describe("roleAtSignIn", () => {
	const staff = {
		superAdmins: parseAdminEmails("boss@example.com"),
		admins: parseAdminEmails("dave@example.com"),
		moderators: parseAdminEmails(""),
	};

	test("keeps the role stored in the database", () => {
		expect(
			roleAtSignIn(
				{ email: "eve@example.com", emailVerified: true, role: "moderator" },
				staff,
			),
		).toBe("moderator");
	});

	test("no longer re-derives admins and moderators from their lists", () => {
		expect(
			roleAtSignIn(
				{ email: "dave@example.com", emailVerified: true, role: "member" },
				staff,
			),
		).toBe("member");
	});

	test("always puts a listed super_admin back", () => {
		expect(
			roleAtSignIn(
				{ email: "Boss@example.com", emailVerified: true, role: "member" },
				staff,
			),
		).toBe("super_admin");
	});

	test("ignores an unverified email in the super_admin list", () => {
		expect(
			roleAtSignIn(
				{ email: "boss@example.com", emailVerified: false, role: "member" },
				staff,
			),
		).toBe("member");
	});
});

describe("roleFromInvitation (#286)", () => {
	test("raises a member to the offered staff role", () => {
		expect(roleFromInvitation("member", "moderator")).toBe("moderator");
		expect(roleFromInvitation(null, "admin")).toBe("admin");
		expect(roleFromInvitation("moderator", "admin")).toBe("admin");
	});

	test("never lowers or repeats a role", () => {
		expect(roleFromInvitation("admin", "moderator")).toBeNull();
		expect(roleFromInvitation("admin", "admin")).toBeNull();
		expect(roleFromInvitation("super_admin", "admin")).toBeNull();
	});
});
