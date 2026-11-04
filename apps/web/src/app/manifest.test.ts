/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";

import { BRAND } from "@/lib/brand";
import manifest from "./manifest";
import { GET } from "./offline/route";

describe("web app manifest", () => {
	const m = manifest();

	test("meets the installability criteria", () => {
		expect(m.name).toBeTruthy();
		expect(m.start_url).toBe("/");
		expect(m.display).toBe("standalone");
		const sizes = (m.icons ?? []).map((icon) => icon.sizes);
		expect(sizes).toContain("192x192");
		expect(sizes).toContain("512x512");
		expect((m.icons ?? []).some((icon) => icon.purpose === "maskable")).toBe(
			true,
		);
	});

	test("every icon is a committed file", () => {
		for (const icon of m.icons ?? []) {
			expect(
				existsSync(new URL(`../../public${icon.src}`, import.meta.url)),
			).toBe(true);
		}
	});

	test("the colours are hex values, the same everywhere they appear", async () => {
		expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/);
		expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/);
		expect(m.theme_color).toBe(BRAND.primary);
		expect(m.background_color).toBe(BRAND.background);
		// The offline page is HTML with its own CSS: it must carry the same colours.
		const html = await GET().text();
		for (const color of Object.values(BRAND)) {
			expect(html).toContain(color);
		}
	});
});
