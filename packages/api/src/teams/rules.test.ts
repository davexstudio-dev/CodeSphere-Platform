/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { githubRepoOf } from "./repo-check";
import { deadlinesOf, isOpen, newInviteToken } from "./rules";

describe("deadlinesOf", () => {
	test("registration closes with the submissions unless it has its own Milestone", () => {
		const base = [
			{ key: "submission_close", startsAt: "2026-10-25T17:00:00Z" },
		];
		expect(deadlinesOf(base).registrationClose?.toISOString()).toBe(
			"2026-10-25T17:00:00.000Z",
		);
		const own = [
			...base,
			{ key: "registration_close", startsAt: "2026-10-20T00:00:00Z" },
		];
		expect(deadlinesOf(own).registrationClose?.toISOString()).toBe(
			"2026-10-20T00:00:00.000Z",
		);
		expect(deadlinesOf(own).submissionClose?.toISOString()).toBe(
			"2026-10-25T17:00:00.000Z",
		);
	});

	test("isOpen is false from the deadline on, true when there is none", () => {
		const close = new Date("2026-10-25T17:00:00Z");
		expect(isOpen(close, new Date("2026-10-25T16:59:59Z"))).toBe(true);
		expect(isOpen(close, new Date("2026-10-25T17:00:00Z"))).toBe(false);
		expect(isOpen(null, new Date())).toBe(true);
	});
});

describe("newInviteToken", () => {
	test("is long, URL-safe and different each time", () => {
		const a = newInviteToken();
		expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
		expect(newInviteToken()).not.toBe(a);
	});
});

describe("githubRepoOf", () => {
	test("reads owner and repo, ignores the rest", () => {
		expect(githubRepoOf("https://github.com/acme/app")).toEqual({
			owner: "acme",
			repo: "app",
		});
		expect(
			githubRepoOf("https://www.github.com/acme/app.git/tree/main"),
		).toEqual({ owner: "acme", repo: "app" });
	});
	test("is null for another host or an incomplete path", () => {
		expect(githubRepoOf("https://gitlab.com/acme/app")).toBeNull();
		expect(githubRepoOf("https://github.com/acme")).toBeNull();
		expect(githubRepoOf("nope")).toBeNull();
	});
});
