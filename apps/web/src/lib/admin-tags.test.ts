/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { deleteBlock, tagGroup, tagMutationErrorKey } from "./admin-tags";

const tag = (over = {}) => ({
	id: "t",
	name: "x",
	version: 1,
	questionCount: 0,
	ownerHackathon: null as string | null,
	...over,
});

describe("tagGroup", () => {
	test("protected first, then used, then unused", () => {
		expect(tagGroup(tag({ ownerHackathon: "cadev-2026" }))).toBe("protected");
		expect(tagGroup(tag({ reserved: true }))).toBe("protected");
		expect(tagGroup(tag({ questionCount: 3 }))).toBe("used");
		expect(tagGroup(tag())).toBe("unused");
	});
});

describe("deleteBlock", () => {
	test("says why a Tag cannot be deleted, before any action", () => {
		expect(deleteBlock(tag({ ownerHackathon: "cadev-2026" }))).toEqual({
			reason: "owned",
			slug: "cadev-2026",
		});
		expect(deleteBlock(tag({ questionCount: 12 }))).toEqual({
			reason: "used",
			count: 12,
		});
		expect(deleteBlock(tag({ reserved: true, questionCount: 4 }))).toEqual({
			reason: "reserved",
		});
		expect(deleteBlock(tag())).toBeNull();
	});
});

describe("tagMutationErrorKey", () => {
	test("CONFLICT is told apart from the rest", () => {
		expect(tagMutationErrorKey({ code: "CONFLICT" })).toBe("conflict");
		expect(tagMutationErrorKey({ code: "FORBIDDEN" })).toBe("forbidden");
		expect(tagMutationErrorKey(new Error("x"))).toBe("generic");
	});
});
