import { describe, expect, test } from "bun:test";

import {
	AFRICAN_COUNTRY_CODES,
	COUNTRY_OTHER,
	countryName,
	countryOptions,
	filterCountries,
	isCountryCode,
	normalizeSearch,
	OTHER_COUNTRY_CODES,
} from "./countries";

describe("the country list", () => {
	test("has the 54 African countries, none twice anywhere", () => {
		expect(AFRICAN_COUNTRY_CODES).toHaveLength(54);
		const all = [...AFRICAN_COUNTRY_CODES, ...OTHER_COUNTRY_CODES];
		expect(new Set(all).size).toBe(all.length);
		for (const code of all) {
			expect(code).toMatch(/^[A-Z]{2}$/);
		}
	});

	test("has a flag file for every country", async () => {
		const files = new Set(
			(
				await Array.fromAsync(
					new Bun.Glob("*.svg").scan("../../apps/web/public/flags"),
				)
			).map((f) => f.replace(".svg", "")),
		);
		for (const code of [...AFRICAN_COUNTRY_CODES, ...OTHER_COUNTRY_CODES]) {
			expect(files.has(code)).toBe(true);
		}
	});

	test("knows a country by code, in any case", () => {
		expect(isCountryCode("ci")).toBe(true);
		expect(isCountryCode("BF")).toBe(true);
		expect(isCountryCode("ZZ")).toBe(false);
		expect(isCountryCode(null)).toBe(false);
	});
});

describe("names and options", () => {
	test("names a country in the interface language", () => {
		expect(countryName("CI", "fr")).toBe("Côte d’Ivoire");
		expect(countryName("CI", "en")).toBe("Côte d’Ivoire");
		expect(countryName("SN", "fr")).toBe("Sénégal");
		expect(countryName("SN", "en")).toBe("Senegal");
		expect(countryName(COUNTRY_OTHER, "fr")).toBe("Autre pays");
	});

	test("lists African countries first, then the others, then the diaspora option", () => {
		const options = countryOptions("fr");
		const firstOther = options.findIndex((o) => !o.africa);
		expect(options.slice(0, firstOther).every((o) => o.africa)).toBe(true);
		expect(firstOther).toBe(54);
		expect(options.at(-1)?.value).toBe(COUNTRY_OTHER);
		const africanNames = options.slice(0, 54).map((o) => o.label);
		expect(africanNames).toEqual(
			[...africanNames].sort((a, b) => a.localeCompare(b, "fr")),
		);
	});
});

describe("searching", () => {
	const options = countryOptions("fr");

	test("ignores accents, case, apostrophes and hyphens", () => {
		expect(normalizeSearch("  Côte d’Ivoire ")).toBe("cote d ivoire");
		expect(
			filterCountries(options, "cote d ivoire").map((o) => o.value),
		).toContain("CI");
		expect(filterCountries(options, "SENEGAL").map((o) => o.value)).toContain(
			"SN",
		);
	});

	test("finds by a part of the name or by the exact code", () => {
		expect(filterCountries(options, "burk").map((o) => o.value)).toEqual([
			"BF",
		]);
		expect(filterCountries(options, "bf").map((o) => o.value)).toContain("BF");
		expect(filterCountries(options, "zzzz")).toEqual([]);
	});

	test("an empty query keeps every option", () => {
		expect(filterCountries(options, "  ")).toHaveLength(options.length);
	});
});
