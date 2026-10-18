/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import {
	excerpt,
	intentUrl,
	plainText,
	previewMetadata,
	SHARE_TARGETS,
	shareUrl,
} from "./share";

describe("plainText", () => {
	test("drops code, images and markup but keeps link text", () => {
		const md =
			"# Title\n\nSee [the docs](https://x.dev) and `foo()`.\n\n```ts\nsecret()\n```\n![img](a.png) **bold**";
		expect(plainText(md)).toBe("Title See the docs and foo(). bold");
	});
});

describe("excerpt", () => {
	test("returns short text untouched", () => {
		expect(excerpt("hello  world")).toBe("hello world");
	});
	test("cuts on a word boundary with an ellipsis", () => {
		const out = excerpt("word ".repeat(100), 50);
		expect(out.endsWith("…")).toBe(true);
		expect(out.length).toBeLessThanOrEqual(51);
		expect(out).not.toContain("wor…");
	});
});

describe("shareUrl", () => {
	test("tags the url and keeps existing params", () => {
		expect(shareUrl("https://a.dev/questions/1?tab=x")).toBe(
			"https://a.dev/questions/1?tab=x&ref=share",
		);
	});
});

describe("intentUrl", () => {
	const input = { url: "https://a.dev/q?ref=share", text: "Why & how?" };
	test("encodes url and text for every target", () => {
		for (const target of SHARE_TARGETS) {
			const link = intentUrl(target, input);
			expect(link.startsWith("https://")).toBe(true);
			expect(link).not.toContain(" ");
			expect(link).toContain(
				encodeURIComponent("https://a.dev/q?ref=share").slice(0, 20),
			);
		}
	});
	test("whatsapp carries text and url in one message", () => {
		expect(intentUrl("whatsapp", input)).toBe(
			`https://wa.me/?text=${encodeURIComponent("Why & how? https://a.dev/q?ref=share")}`,
		);
	});
});

describe("previewMetadata", () => {
	test("builds title, canonical and cards", () => {
		const m = previewMetadata({
			title: "How to X?",
			description: "A **long** body",
			url: "https://a.dev/questions/1",
			imageUrl: "https://a.dev/og-default.png",
		});
		expect(m.title).toBe("How to X? · CodeSphere");
		expect(m.description).toBe("A long body");
		expect(m.alternates.canonical).toBe("https://a.dev/questions/1");
		expect(m.openGraph.title).toBe("How to X?");
		expect(m.twitter.card).toBe("summary_large_image");
		expect(m.twitter.images).toEqual(["https://a.dev/og-default.png"]);
		expect(m.openGraph.images).toEqual([
			{
				url: "https://a.dev/og-default.png",
				width: 1200,
				height: 630,
				alt: "CodeSphere",
			},
		]);
	});
});
