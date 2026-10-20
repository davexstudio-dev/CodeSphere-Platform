/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { postSignInPath } from "./post-signin";

describe("postSignInPath", () => {
	test("sends a visitor back to the sign-in page", () => {
		expect(postSignInPath(null)).toBe("/signin");
	});

	test("sends an Admin to the back-office", () => {
		expect(postSignInPath({ role: "admin" })).toBe("/dashboard");
	});

	test("sends every staff role to the back-office", () => {
		expect(postSignInPath({ role: "super_admin" })).toBe("/dashboard");
		expect(postSignInPath({ role: "moderator" })).toBe("/admin");
	});

	test("sends any other Member home", () => {
		expect(postSignInPath({ role: "member" })).toBe("/");
		expect(postSignInPath({})).toBe("/");
	});
});
