// A small RSS 2.0 / Atom reader. Workers have no DOM parser and a feed is regular enough: items
// are cut out by tag and only a link, a title, a date and a short plain-text summary are kept.

export const SUMMARY_MAX = 300;
export const TITLE_MAX = 200;

export type ParsedItem = {
	url: string;
	title: string;
	summary: string;
	publishedAt: Date | null;
};

const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
};

function decode(text: string): string {
	return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
		if (body.startsWith("#")) {
			const code =
				body[1]?.toLowerCase() === "x"
					? Number.parseInt(body.slice(2), 16)
					: Number.parseInt(body.slice(1), 10);
			return Number.isFinite(code) && code > 0 && code < 0x110000
				? String.fromCodePoint(code)
				: match;
		}
		return ENTITIES[body.toLowerCase()] ?? match;
	});
}

/** Text of a tag's content: CDATA unwrapped, markup removed, entities decoded, spaces collapsed. */
export function plainText(raw: string): string {
	const unwrapped = raw.replace(
		/<!\[CDATA\[([\s\S]*?)\]\]>/g,
		(_, inner: string) => inner,
	);
	// A feed may carry escaped HTML (`&lt;p&gt;`): decode once, then strip, then decode again.
	const stripped = decode(unwrapped)
		.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
		.replace(
			/<\/?(p|br|div|li|ul|ol|h[1-6]|tr|td|blockquote|pre)\b[^>]*>/gi,
			" ",
		)
		.replace(/<[^>]*>/g, "");
	return decode(stripped).replace(/\s+/g, " ").trim();
}

export function truncate(text: string, max: number): string {
	const chars = [...text];
	return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}

const blocks = (xml: string, tag: string) =>
	[
		...xml.matchAll(
			new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi"),
		),
	].map((m) => m[1] ?? "");

const firstTag = (xml: string, tag: string) => blocks(xml, tag)[0] ?? null;

function atomLink(entry: string): string | null {
	const links = [...entry.matchAll(/<link\b([^>]*?)\/?>/gi)].map(
		(m) => m[1] ?? "",
	);
	const attr = (attrs: string, name: string) =>
		new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(attrs)?.[1];
	const alternate =
		links.find((l) => (attr(l, "rel") ?? "alternate") === "alternate") ??
		links[0];
	const href = alternate ? attr(alternate, "href") : undefined;
	return href ? decode(href) : null;
}

function date(value: string | null): Date | null {
	if (!value) {
		return null;
	}
	const parsed = new Date(plainText(value));
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Items of an RSS 2.0 or Atom document; entries without a link or a title are skipped. */
export function parseFeed(xml: string): ParsedItem[] {
	const atom = /<feed[\s>]/i.test(xml);
	const entries = blocks(xml, atom ? "entry" : "item");
	const items: ParsedItem[] = [];
	for (const entry of entries) {
		const link = atom
			? atomLink(entry)
			: plainText(firstTag(entry, "link") ?? "") || null;
		const title = plainText(firstTag(entry, "title") ?? "");
		if (!link || !title) {
			continue;
		}
		const summary = plainText(
			firstTag(entry, atom ? "summary" : "description") ??
				firstTag(entry, "content") ??
				"",
		);
		items.push({
			url: link,
			title: truncate(title, TITLE_MAX),
			summary: truncate(summary, SUMMARY_MAX),
			publishedAt: date(
				firstTag(entry, atom ? "published" : "pubDate") ??
					firstTag(entry, "updated") ??
					firstTag(entry, "dc:date"),
			),
		});
	}
	return items;
}
