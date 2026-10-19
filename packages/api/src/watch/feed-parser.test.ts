/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { parseFeed, plainText, SUMMARY_MAX } from "./feed-parser";

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Blog</title>
<item><title><![CDATA[Un <b>titre</b> &amp; plus]]></title><link>https://blog.example/a?utm_source=rss</link>
<description><![CDATA[<p>Résumé <img src="x.png"> avec <a href="y">lien</a>.</p>]]></description>
<pubDate>Mon, 12 Oct 2026 09:00:00 GMT</pubDate></item>
<item><title>Sans lien</title></item>
<item><title>Escaped</title><link>https://blog.example/b</link><description>&lt;p&gt;Hello &amp;amp; bye&lt;/p&gt;</description></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
<entry><title>Entry</title><link rel="self" href="https://a.example/self"/><link rel="alternate" href="https://a.example/post"/>
<summary>Short</summary><updated>2026-10-12T09:00:00Z</updated></entry></feed>`;

describe("parseFeed", () => {
	test("reads RSS items, drops markup and images, skips items without a link", () => {
		const items = parseFeed(RSS);
		expect(items).toHaveLength(2);
		expect(items[0]).toMatchObject({
			url: "https://blog.example/a?utm_source=rss",
			title: "Un titre & plus",
			summary: "Résumé avec lien.",
		});
		expect(items[0]?.publishedAt?.toISOString()).toBe(
			"2026-10-12T09:00:00.000Z",
		);
		expect(items[1]?.summary).toBe("Hello & bye");
		expect(items[1]?.publishedAt).toBeNull();
	});

	test("reads Atom entries and prefers the alternate link", () => {
		const [item] = parseFeed(ATOM);
		expect(item?.url).toBe("https://a.example/post");
		expect(item?.publishedAt?.toISOString()).toBe("2026-10-12T09:00:00.000Z");
	});

	test("caps the summary at 300 characters", () => {
		const long = "é".repeat(1000);
		const [item] = parseFeed(
			`<rss><channel><item><title>t</title><link>https://x.example/a</link><description>${long}</description></item></channel></rss>`,
		);
		expect([...(item?.summary ?? "")]).toHaveLength(SUMMARY_MAX);
	});

	test("script and style content never reach the summary", () => {
		expect(plainText("<script>alert(1)</script>ok<style>a{}</style>")).toBe(
			"ok",
		);
	});

	test("a comparison sign in the text is not taken for a tag", () => {
		expect(plainText("Why x &lt; y &amp;&amp; y &gt; z")).toBe(
			"Why x < y && y > z",
		);
	});

	test("garbage gives no item", () => {
		expect(parseFeed("not xml")).toEqual([]);
	});
});
