/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { slugify } from "./slug";

describe("slugify", () => {
	test("keeps letters and digits, drops accents and punctuation", () => {
		expect(slugify("Systalink")).toBe("systalink");
		expect(slugify("Société Générale d'Afrique")).toBe(
			"societe-generale-d-afrique",
		);
		expect(slugify("  Orange  Digital Center -- Sénégal ")).toBe(
			"orange-digital-center-senegal",
		);
	});
	test("is empty when nothing usable is left", () => {
		expect(slugify("---")).toBe("");
	});
});
