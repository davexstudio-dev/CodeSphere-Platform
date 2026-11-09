/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { designSystemEnabledFrom, hasDatabaseFrom } from "./deployment";

describe("hasDatabaseFrom", () => {
	test("is false only for an explicit false", () => {
		expect(hasDatabaseFrom("false")).toBe(false);
		expect(hasDatabaseFrom("true")).toBe(true);
	});

	test("defaults to a database when the flag is unset (staging, production)", () => {
		expect(hasDatabaseFrom(undefined)).toBe(true);
	});
});

describe("designSystemEnabledFrom", () => {
	test("is closed only for an explicit false (the production build)", () => {
		expect(designSystemEnabledFrom("false")).toBe(false);
		expect(designSystemEnabledFrom("true")).toBe(true);
	});

	test("stays open when the flag is unset (dev, previews, staging)", () => {
		expect(designSystemEnabledFrom(undefined)).toBe(true);
	});
});
