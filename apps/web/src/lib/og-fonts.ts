/**
 * Fonts for the share cards (#262). The default font of next/og is Latin only: a title in Arabic,
 * Chinese or Amharic would draw as empty boxes. Where the text needs another script, the Noto Sans
 * family of that script is fetched from Google Fonts, cut to the characters of the card, so a few
 * kilobytes travel. A failure leaves the default font: the card is then plain, never an error.
 */

type Script = { family: string; test: RegExp };

// Arabic is IBM Plex Sans Arabic, not Noto: satori cannot read the contextual substitutions of the
// Noto Arabic fonts ("lookupType: 5 - substFormat: 3 is not yet supported") and throws.
// Order matters only for Han, which falls to Simplified Chinese unless a kana or hangul is present.
const SCRIPTS: readonly Script[] = [
	{ family: "IBM Plex Sans Arabic", test: /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/ },
	{ family: "Noto Sans Hebrew", test: /[֐-׿]/ },
	{ family: "Noto Sans Devanagari", test: /[ऀ-ॿ]/ },
	{ family: "Noto Sans Ethiopic", test: /[ሀ-፿]/ },
	{ family: "Noto Sans JP", test: /[぀-ヿ]/ },
	{ family: "Noto Sans KR", test: /[가-힯]/ },
	{ family: "Noto Sans SC", test: /[㐀-䶿一-鿿]/ },
];

/** Cyrillic, Greek and the Latin that goes with them: the base Noto Sans. */
const BASE = { family: "Noto Sans", test: /[Ͱ-ϿЀ-ԯ]/ };

const NEEDS_FONT =
	/[^\t\n\r\u0020-\u024F\u1E00-\u1EFF\u2000-\u2BFF\u{1F000}-\u{1FAFF}]/u;

/**
 * The font families a text needs beyond the default font: none for Latin (accents, punctuation,
 * emoji included), the base Noto Sans plus one family per other script otherwise.
 */
export function familiesFor(text: string): string[] {
	if (!NEEDS_FONT.test(text)) {
		return [];
	}
	const families = SCRIPTS.filter((script) => script.test.test(text)).map(
		(script) => script.family,
	);
	// Latin letters (and Cyrillic, Greek) need a font of their own once `fonts` is set.
	return [BASE.family, ...new Set(families)];
}

/** The distinct characters of a text, as Google Fonts' `text` parameter wants them. */
export function uniqueChars(text: string): string {
	return [...new Set([...text.replace(/\s+/g, " ")])].join("");
}

// A browser from the era of TrueType-only CSS: Google serves woff2 to current ones, which satori
// cannot read.
const OLD_BROWSER =
	"Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1";
const TIMEOUT_MS = 2500;

export async function fetchFont(family: string, chars: string) {
	const css = await (
		await fetch(
			`https://fonts.googleapis.com/css2?family=${family.replaceAll(" ", "+")}:wght@400&text=${encodeURIComponent(chars)}`,
			{
				headers: { "User-Agent": OLD_BROWSER },
				signal: AbortSignal.timeout(TIMEOUT_MS),
			},
		)
	).text();
	const url = /src:\s*url\(([^)]+)\)/.exec(css)?.[1];
	if (!url) {
		throw new Error(`no font file for ${family}`);
	}
	const file = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
	return {
		name: family,
		data: await file.arrayBuffer(),
		weight: 400 as const,
		style: "normal" as const,
	};
}

export type OgFont = Awaited<ReturnType<typeof fetchFont>>;

/** The fonts to hand to next/og for these texts; `undefined` keeps its default font. */
export async function loadFonts(...texts: string[]) {
	const text = texts.join(" ");
	const families = familiesFor(text);
	if (families.length === 0) {
		return undefined;
	}
	const chars = uniqueChars(text);
	const settled = await Promise.allSettled(
		families.map((family) => fetchFont(family, chars)),
	);
	const fonts = settled.flatMap((r) =>
		r.status === "fulfilled" ? [r.value] : [],
	);
	return fonts.length > 0 ? fonts : undefined;
}
