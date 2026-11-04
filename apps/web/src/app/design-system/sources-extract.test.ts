/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { buildSpecimenSources, specimenLabels } from "./sources-extract";
import generated from "./specimen-sources.generated.json";

const dir = new URL("./", import.meta.url);
type Source = { imports: string; jsx: string; files: string[] };
const sources = generated as Record<string, Source>;

describe("design-system specimen sources", () => {
	test("the generated JSON is the pages' code (run `bun run ds:sources`)", () => {
		expect(sources).toEqual(buildSpecimenSources(dir));
	});

	test("every specimen has a unique label and some code", () => {
		const labels = specimenLabels(dir);
		expect(new Set(labels).size).toBe(labels.length);
		for (const label of labels) {
			expect(sources[label]?.jsx.length).toBeGreaterThan(0);
		}
	});

	test("the code carries the imports of the components it uses", () => {
		const tabs =
			sources["Tabs sliding — TabsList (Base UI) et SegmentedControl"];
		expect(tabs?.imports).toContain(
			'from "@codesphere/ui/components/molecules/tabs";',
		);
		expect(tabs?.jsx).toContain("<TabsList>");
		expect(tabs?.files).toContain(
			"packages/ui/src/components/molecules/tabs.tsx",
		);
	});
});
