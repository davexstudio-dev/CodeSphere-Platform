/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { LEGAL_DOCUMENTS } from "@codesphere/contract";

import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import {
	LEGAL_PAGE_MAX_AGE_SECONDS,
	organizationTermsMarkdown,
	pageMarkdown,
	repositoryMarkdown,
} from "./legal";

describe("the texts of the repository as Markdown (#341)", () => {
	test("a page is its intro followed by one titled section per block", () => {
		expect(
			pageMarkdown({
				intro: "Intro.",
				sections: {
					a: { title: "One", body: "First.\n\nSecond." },
					b: { title: "Two", body: "Third." },
				},
			}),
		).toBe("Intro.\n\n## One\n\nFirst.\n\nSecond.\n\n## Two\n\nThird.");
	});

	test("the Organization terms are a sentence and a list", () => {
		expect(
			organizationTermsMarkdown({
				intro: "It agrees:",
				clauses: { c1: "A", c2: "B" },
			}),
		).toBe("It agrees:\n\n- A\n- B");
	});

	for (const [locale, messages] of [
		["fr", fr],
		["en", en],
	] as const) {
		test(`every document has a text in ${locale}, within what a draft may hold`, () => {
			for (const document of LEGAL_DOCUMENTS) {
				const markdown = repositoryMarkdown(document, messages);
				expect(markdown.trim()).not.toBe("");
				expect(markdown.length).toBeLessThanOrEqual(20_000);
			}
		});
	}

	test("a browser keeps a legal page for a few minutes only", () => {
		expect(LEGAL_PAGE_MAX_AGE_SECONDS).toBeGreaterThanOrEqual(60);
		expect(LEGAL_PAGE_MAX_AGE_SECONDS).toBeLessThanOrEqual(600);
	});
});
