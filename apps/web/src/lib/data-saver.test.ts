/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import {
	pageSizeFor,
	parsePreference,
	resolveDataSaver,
	saveDataRequested,
} from "./data-saver";

describe("saveDataRequested", () => {
	test("the Save-Data header turns it on when `on` is among its tokens", () => {
		expect(saveDataRequested("on")).toBe(true);
		expect(saveDataRequested("ON")).toBe(true);
		expect(saveDataRequested("on, other")).toBe(true);
		expect(saveDataRequested("off")).toBe(false);
		expect(saveDataRequested("")).toBe(false);
		expect(saveDataRequested(null)).toBe(false);
		expect(saveDataRequested(undefined)).toBe(false);
		expect(saveDataRequested("often")).toBe(false);
	});
});

describe("parsePreference", () => {
	test("only on and off are choices; anything else is auto", () => {
		expect(parsePreference("on")).toBe("on");
		expect(parsePreference("off")).toBe("off");
		expect(parsePreference(undefined)).toBe("auto");
		expect(parsePreference("")).toBe("auto");
		expect(parsePreference("yes")).toBe("auto");
	});
});

describe("resolveDataSaver", () => {
	test("auto follows the browser", () => {
		expect(resolveDataSaver("auto", "on")).toBe(true);
		expect(resolveDataSaver("auto", null)).toBe(false);
	});

	test("the Member's choice wins over the header, both ways", () => {
		expect(resolveDataSaver("on", null)).toBe(true);
		expect(resolveDataSaver("off", "on")).toBe(false);
	});
});

describe("pageSizeFor", () => {
	test("halves a page in data saver mode, never below one", () => {
		expect(pageSizeFor(20, false)).toBe(20);
		expect(pageSizeFor(20, true)).toBe(10);
		expect(pageSizeFor(5, true)).toBe(3);
		expect(pageSizeFor(1, true)).toBe(1);
	});
});
