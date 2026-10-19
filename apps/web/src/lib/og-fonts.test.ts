import { describe, expect, test } from "bun:test";

import { familiesFor, uniqueChars } from "./og-fonts";

describe("familiesFor", () => {
	test("Latin text, accents, punctuation and emoji keep the default font", () => {
		expect(
			familiesFor("Comment déployer un Worker ? « é à ç » 🚨 — 12"),
		).toEqual([]);
	});

	test("Cyrillic and Greek take the base Noto Sans", () => {
		expect(familiesFor("Как настроить")).toEqual(["Noto Sans"]);
		expect(familiesFor("Ελληνικά")).toEqual(["Noto Sans"]);
	});

	test("each other script adds its own family after the base", () => {
		expect(familiesFor("كيف أنشر؟")).toEqual([
			"Noto Sans",
			"IBM Plex Sans Arabic",
		]);
		expect(familiesFor("ሰላም ለዓለም")).toEqual([
			"Noto Sans",
			"Noto Sans Ethiopic",
		]);
		expect(familiesFor("如何部署")).toEqual(["Noto Sans", "Noto Sans SC"]);
		expect(familiesFor("デプロイ方法")).toEqual([
			"Noto Sans",
			"Noto Sans JP",
			"Noto Sans SC",
		]);
		expect(familiesFor("배포 방법")).toEqual(["Noto Sans", "Noto Sans KR"]);
	});

	test("a title mixing Latin and Arabic needs both", () => {
		expect(familiesFor("Worker و Cloudflare")).toEqual([
			"Noto Sans",
			"IBM Plex Sans Arabic",
		]);
	});
});

describe("uniqueChars", () => {
	test("keeps each character once, whitespace folded", () => {
		expect(uniqueChars("aab  b\nc")).toBe("ab c");
	});
});
