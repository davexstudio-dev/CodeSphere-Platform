/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import {
	isApiPath,
	isFlagAsset,
	isPageNavigation,
	isStaticAsset,
	OFFLINE_URL,
} from "./routes";

const ORIGIN = "https://codesphereplatform.xyz";
const url = (path: string, origin = ORIGIN) => new URL(path, origin);

describe("isApiPath", () => {
	test("the API, RPC, MCP and auth paths are never the worker's", () => {
		for (const path of [
			"/api",
			"/api/v1/questions",
			"/api/auth/callback/github",
			"/rpc/questions/list",
			"/mcp",
		]) {
			expect(isApiPath(path)).toBe(true);
		}
		for (const path of ["/", "/questions/1", "/apiary", "/rpcs"]) {
			expect(isApiPath(path)).toBe(false);
		}
	});
});

describe("isStaticAsset", () => {
	test("only hashed build output of this origin is cached", () => {
		expect(isStaticAsset(url("/_next/static/chunks/a.js"), ORIGIN)).toBe(true);
		expect(isStaticAsset(url("/_next/static/media/f.woff2"), ORIGIN)).toBe(
			true,
		);
		expect(isStaticAsset(url("/_next/image?url=x"), ORIGIN)).toBe(false);
		expect(isStaticAsset(url("/questions/1"), ORIGIN)).toBe(false);
		expect(
			isStaticAsset(url("/_next/static/a.js", "https://cdn.example"), ORIGIN),
		).toBe(false);
	});
});

describe("isPageNavigation", () => {
	const nav = { mode: "navigate" };
	test("a page of this origin gets the offline fallback", () => {
		expect(isPageNavigation(nav, url("/"), ORIGIN)).toBe(true);
		expect(isPageNavigation(nav, url("/questions/1"), ORIGIN)).toBe(true);
	});

	test("API calls, other origins, sub-requests and the offline page itself do not", () => {
		// An OAuth redirect starts on /api/auth: the worker must not sit in the middle of it.
		expect(isPageNavigation(nav, url("/api/auth/sign-in/social"), ORIGIN)).toBe(
			false,
		);
		expect(
			isPageNavigation(nav, url("/", "https://elsewhere.example"), ORIGIN),
		).toBe(false);
		expect(isPageNavigation({ mode: "cors" }, url("/"), ORIGIN)).toBe(false);
		expect(isPageNavigation(nav, url(OFFLINE_URL), ORIGIN)).toBe(false);
	});
});

describe("isFlagAsset", () => {
	test("only a flag file of this origin", () => {
		expect(isFlagAsset(url("/flags/CI.svg"), ORIGIN)).toBe(true);
		expect(isFlagAsset(url("/flags/ci.svg"), ORIGIN)).toBe(false);
		expect(isFlagAsset(url("/flags/CI.svg.map"), ORIGIN)).toBe(false);
		expect(
			isFlagAsset(url("/flags/CI.svg", "https://cdn.example"), ORIGIN),
		).toBe(false);
	});
});
