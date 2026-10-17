/** Sharing a public page (ADR 0001): metadata for link previews and the links a "Share" menu offers. */

export const SHARE_REF = "share";

const DESCRIPTION_MAX = 200;

export type ShareTarget =
	| "whatsapp"
	| "x"
	| "linkedin"
	| "telegram"
	| "facebook";

/** The targets, in the order shown: WhatsApp leads for our readers. */
export const SHARE_TARGETS: readonly ShareTarget[] = [
	"whatsapp",
	"x",
	"linkedin",
	"telegram",
	"facebook",
];

/** Plain text from Markdown: code, images, links, headings and emphasis flattened to words. */
export function plainText(markdown: string): string {
	return markdown
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`([^`]*)`/g, "$1")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/<[^>]+>/g, " ")
		.replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
		.replace(/[*_~]+/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

/** A preview description: the plain text cut on a word boundary, with an ellipsis if cut. */
export function excerpt(markdown: string, max = DESCRIPTION_MAX): string {
	const text = plainText(markdown);
	if (text.length <= max) {
		return text;
	}
	const cut = text.slice(0, max);
	const lastSpace = cut.lastIndexOf(" ");
	return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** The URL to share: the page, tagged so a visit from a share can be counted (no cookie). */
export function shareUrl(pageUrl: string): string {
	const url = new URL(pageUrl);
	url.searchParams.set("ref", SHARE_REF);
	return url.toString();
}

/** The "share intent" link of a network. The URL and text are encoded; nothing else is added. */
export function intentUrl(
	target: ShareTarget,
	{ url, text }: { url: string; text: string },
): string {
	const u = encodeURIComponent(url);
	const t = encodeURIComponent(text);
	switch (target) {
		case "whatsapp":
			return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
		case "x":
			return `https://twitter.com/intent/tweet?text=${t}&url=${u}`;
		case "linkedin":
			return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
		case "telegram":
			return `https://t.me/share/url?url=${u}&text=${t}`;
		case "facebook":
			return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
	}
}

type PreviewInput = {
	title: string;
	/** Markdown, or a plain description. */
	description: string;
	url: string;
};

export type Preview = {
	title: string;
	description: string;
	alternates: { canonical: string };
	openGraph: {
		type: "article";
		title: string;
		description: string;
		url: string;
		siteName: string;
	};
	twitter: { card: "summary"; title: string; description: string };
};

export const SITE_NAME = "CodeSphere";

/** Link-preview metadata of a public page. */
export function previewMetadata({
	title,
	description,
	url,
}: PreviewInput): Preview {
	const text = excerpt(description);
	return {
		title: `${title} · ${SITE_NAME}`,
		description: text,
		alternates: { canonical: url },
		openGraph: {
			type: "article",
			title,
			description: text,
			url,
			siteName: SITE_NAME,
		},
		twitter: { card: "summary", title, description: text },
	};
}
