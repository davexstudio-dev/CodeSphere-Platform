/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { progressOf, roadmapIn } from "./roadmap";
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

describe("progressOf", () => {
	test("counts each status and the delivered share", () => {
		expect(
			progressOf([
				{ status: "delivered" },
				{ status: "delivered" },
				{ status: "in_progress" },
				{ status: "planned" },
			]),
		).toEqual({
			delivered: 2,
			inProgress: 1,
			planned: 1,
			total: 4,
			percent: 50,
		});
	});

	test("rounds the share, and an empty list is 0 % rather than NaN", () => {
		expect(
			progressOf([
				{ status: "delivered" },
				{ status: "planned" },
				{ status: "planned" },
			]).percent,
		).toBe(33);
		expect(progressOf([])).toMatchObject({ total: 0, percent: 0 });
	});

	test("the real roadmap has lines, and every one is counted once", () => {
		const all = roadmapIn("fr").sections.flatMap((section) => section.items);
		const progress = progressOf(all);
		expect(progress.total).toBe(all.length);
		expect(progress.delivered + progress.inProgress + progress.planned).toBe(
			progress.total,
		);
		expect(progress.total).toBeGreaterThan(0);
	});
});
