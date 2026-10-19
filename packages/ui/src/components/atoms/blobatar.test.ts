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

	test("skips symbols, and a name with no letter or digit is a question mark", () => {
		expect(initialsOf("@bob")).toBe("B");
		expect(initialsOf("123")).toBe("1");
		expect(initialsOf("")).toBe("?");
		expect(initialsOf("   ")).toBe("?");
		expect(initialsOf("🙂")).toBe("?");
	});
});
