/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { initialsOf } from "./blobatar";

describe("initialsOf", () => {
	test("the first and last initials, upper-cased", () => {
		expect(initialsOf("Ada Lovelace")).toBe("AL");
		expect(initialsOf("ada")).toBe("A");
		expect(initialsOf("  grace   brewster   hopper ")).toBe("GH");
		expect(initialsOf("élodie ñ")).toBe("ÉÑ");
	});

	test("an empty name has none", () => {
		expect(initialsOf("")).toBe("");
		expect(initialsOf("   ")).toBe("");
	});
});
