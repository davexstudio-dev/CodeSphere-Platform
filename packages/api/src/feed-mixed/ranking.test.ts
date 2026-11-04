/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import {
	DEFAULT_FEED_RANKING,
	diversify,
	parseFeedRanking,
	reasonsFor,
} from "./ranking";

describe("parseFeedRanking", () => {
	test("defaults are the coefficients of decision #226", () => {
		expect(parseFeedRanking(undefined)).toEqual(DEFAULT_FEED_RANKING);
		expect(DEFAULT_FEED_RANKING).toMatchObject({
			languageBonus: 1.3,
			africaBonus: 1.2,
			maxRun: 2,
		});
	});

	test("overrides some coefficients without code", () => {
		expect(parseFeedRanking('{"africaBonus":1.5}')).toEqual({
			...DEFAULT_FEED_RANKING,
			africaBonus: 1.5,
		});
	});

	test("a typo stops the deployment", () => {
		expect(() => parseFeedRanking("{")).toThrow("not valid JSON");
		expect(() => parseFeedRanking('{"africaBonuss":2}')).toThrow("invalid");
		expect(() => parseFeedRanking('{"maxRun":0}')).toThrow("invalid");
	});
});

const item = (id: string, ...keys: string[]) => ({ id, keys });

describe("diversify", () => {
	test("never more than two in a row from the same Source or Tag", () => {
		const items = [
			item("a1", "s:a", "sql"),
			item("a2", "s:a", "go"),
			item("a3", "s:a", "rust"),
			item("b1", "s:b", "css"),
		];
		expect(diversify(items, 2).map((i) => i.id)).toEqual([
			"a1",
			"a2",
			"b1",
			"a3",
		]);
	});

	test("the same Tag counts as well as the Source", () => {
		const items = [
			item("1", "sql"),
			item("2", "sql"),
			item("3", "sql"),
			item("4", "go"),
		];
		expect(diversify(items, 2).map((i) => i.id)).toEqual(["1", "2", "4", "3"]);
	});

	test("gives way rather than dropping items when nothing else is left", () => {
		const items = [item("1", "x"), item("2", "x"), item("3", "x")];
		expect(diversify(items, 2).map((i) => i.id)).toEqual(["1", "2", "3"]);
	});

	test("keeps the ranked order when the rule is not at stake", () => {
		const items = [item("1", "a"), item("2", "b"), item("3", "c")];
		expect(diversify(items, 2)).toEqual(items);
	});
});

describe("reasonsFor", () => {
	test("says why, most specific first, and falls back to trending", () => {
		expect(
			reasonsFor({
				followedTags: ["sql"],
				learnedTags: ["sql", "go"],
				language: true,
				african: true,
			}),
		).toEqual([
			{ code: "followed_tag", value: "sql" },
			{ code: "learned_tag", value: "go" },
			{ code: "language" },
			{ code: "african" },
		]);
		expect(
			reasonsFor({
				followedTags: [],
				learnedTags: [],
				language: false,
				african: false,
			}),
		).toEqual([{ code: "trending" }]);
	});
});
