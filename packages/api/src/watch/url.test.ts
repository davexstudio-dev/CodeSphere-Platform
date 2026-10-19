/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import {
	domainOf,
	InvalidUrlError,
	isBlocked,
	isPublicHost,
	normalizeUrl,
} from "./url";

describe("normalizeUrl", () => {
	test("gives one key to spellings of the same article", () => {
		const key = "https://example.com/a?a=1&b=2";
		for (const raw of [
			"https://www.Example.com:443/a/?utm_source=x&b=2&a=1#top",
			"http://example.com/a?b=2&a=1&fbclid=zz",
			" https://example.com/a/ ?a=1&b=2".replace(" ?", "?"),
		]) {
			expect(normalizeUrl(raw)).toBe(key);
		}
	});

	test("keeps a real port and drops credentials", () => {
		expect(normalizeUrl("https://u:p@example.com:8443/x")).toBe(
			"https://example.com:8443/x",
		);
	});

	test("refuses what is not a public http(s) link", () => {
		for (const raw of [
			"ftp://example.com/x",
			"javascript:alert(1)",
			"nope",
			"http://localhost/x",
		]) {
			expect(() => normalizeUrl(raw)).toThrow(InvalidUrlError);
		}
	});
});

describe("domains", () => {
	test("domainOf drops www", () => {
		expect(domainOf("https://www.Blog.Example.com/x")).toBe("blog.example.com");
	});
	test("a blocked domain blocks its subdomains, not its lookalikes", () => {
		expect(isBlocked("blog.bad.com", ["bad.com"])).toBe(true);
		expect(isBlocked("bad.com", ["bad.com"])).toBe(true);
		expect(isBlocked("notbad.com", ["bad.com"])).toBe(false);
	});
});

describe("meaningful parameters", () => {
	test("ref and source are kept: they can select a different page", () => {
		expect(normalizeUrl("https://github.com/o/r/blob/x?ref=v1")).not.toBe(
			normalizeUrl("https://github.com/o/r/blob/x?ref=v2"),
		);
	});
	test("addresses and local names are not public hosts", () => {
		for (const host of [
			"127.0.0.1",
			"169.254.169.254",
			"localhost",
			"db.internal",
			"[::1]",
			"nas.local",
		]) {
			expect(isPublicHost(host)).toBe(false);
		}
		expect(isPublicHost("blog.example.com")).toBe(true);
	});
});
