/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { roadmapIn } from "./roadmap";
import generated from "./roadmap.generated.json";

const yaml = Bun.YAML.parse(
	readFileSync(
		new URL("../../../../docs/roadmap.yaml", import.meta.url),
		"utf8",
	),
);

describe("roadmap", () => {
	test("the generated JSON is the YAML source (run `bun run roadmap:build`)", () => {
		expect(generated).toEqual(JSON.parse(JSON.stringify(yaml)));
	});

	test("every line has both languages and a known status", () => {
		for (const section of generated.sections) {
			expect(section.title.fr && section.title.en).toBeTruthy();
			for (const item of section.items) {
				expect(item.fr && item.en).toBeTruthy();
				expect(["delivered", "in_progress", "planned"]).toContain(item.status);
			}
		}
		for (const item of generated.not_doing) {
			expect(item.fr && item.en).toBeTruthy();
		}
	});

	test("picks the language", () => {
		expect(roadmapIn("fr").sections[0]?.title).toBe("Déjà livré");
		expect(roadmapIn("en").sections[0]?.title).toBe("Already delivered");
	});
});
