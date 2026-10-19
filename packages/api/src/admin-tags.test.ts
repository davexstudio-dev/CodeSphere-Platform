import { describe, expect, test } from "bun:test";

import { adminTag, normalizeTagName } from "./admin-tags";

describe("normalizeTagName", () => {
	test("`JavaScript ` and `javascript` are the same Tag", () => {
		expect(normalizeTagName("JavaScript ")).toBe(
			normalizeTagName("javascript"),
		);
	});
});

describe("adminTag", () => {
	test("reads the count back as a number and keeps the owner", () => {
		expect(
			adminTag({
				id: "t1",
				name: "cadev-2026",
				version: 1,
				questionCount: "12" as unknown as number,
				ownerHackathon: "cadev-2026",
				reserved: false,
			}),
		).toMatchObject({ questionCount: 12, ownerHackathon: "cadev-2026" });
	});

	test("flags the tags the product relies on as system", () => {
		const row = {
			id: "t",
			version: 1,
			questionCount: 0,
			ownerHackathon: null,
			reserved: true,
		};
		expect(adminTag({ ...row, name: "roadmap" })).toMatchObject({
			reserved: true,
			system: true,
		});
		expect(adminTag({ ...row, name: "sql" })).toMatchObject({
			reserved: true,
			system: false,
		});
	});
});
