import { describe, expect, test } from "bun:test";

import { cardText } from "./og-card";

describe("cardText", () => {
	test("keeps a short title and signs the score", () => {
		expect(cardText({ title: "How to X?", score: 12 })).toEqual({
			title: "How to X?",
			tags: [],
			score: "+12",
			subtitle: null,
		});
		expect(cardText({ title: "t", score: -3 }).score).toBe("-3");
		expect(cardText({ title: "t", score: 0 }).score).toBe("0");
	});

	test("no score where none is given", () => {
		expect(cardText({ title: "t" }).score).toBeNull();
		expect(cardText({ title: "t", score: null }).score).toBeNull();
		expect(cardText({ title: "t", score: Number.NaN }).score).toBeNull();
	});

	test("cuts a long title on a word with an ellipsis", () => {
		const title = `${"word ".repeat(40)}end`;
		const { title: cut } = cardText({ title });
		expect(cut.length).toBeLessThanOrEqual(111);
		expect(cut.endsWith("…")).toBe(true);
		expect(cut).not.toContain("wor…");
	});

	test("collapses whitespace and keeps at most four short Tags", () => {
		const out = cardText({
			title: "  a \n  b ",
			tags: [
				"react",
				"",
				"typescript",
				"a-very-long-tag-name-that-overflows",
				"go",
				"rust",
			],
		});
		expect(out.title).toBe("a b");
		expect(out.tags).toHaveLength(4);
		expect(out.tags).not.toContain("");
		expect(out.tags[2]?.endsWith("…")).toBe(true);
	});

	test("clips the subtitle", () => {
		const { subtitle } = cardText({ title: "t", subtitle: "x".repeat(100) });
		expect(subtitle).toBe(`${"x".repeat(60)}…`);
	});

	test("never cuts an emoji in half", () => {
		const { title } = cardText({ title: "😀".repeat(150) });
		expect(title).toBe(`${"😀".repeat(110)}…`);
	});
});
