// Normal form of a link, so one article is one item whatever tracking or spelling a feed adds.

const TRACKING = /^(utm_|mc_|ga_|pk_|mtm_)/i;
const TRACKING_EXACT = new Set([
	"fbclid",
	"gclid",
	"dclid",
	"msclkid",
	"igshid",
	"ref",
	"ref_src",
	"source",
	"yclid",
	"_hsenc",
	"_hsmi",
]);

export class InvalidUrlError extends Error {}

/** The host without a leading `www.`, lowercase. */
export const domainOf = (url: string) =>
	new URL(url).hostname.toLowerCase().replace(/^www\./, "");

/**
 * `https://www.Example.com:443/a/?utm_source=x&b=2&a=1#top` -> `https://example.com/a?a=1&b=2`.
 * Only http(s) links are accepted; credentials are dropped. The scheme is made https: the two
 * serve the same page and a duplicate per scheme would defeat the point.
 */
export function normalizeUrl(raw: string): string {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		throw new InvalidUrlError("not a URL");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new InvalidUrlError("only http(s) links");
	}
	const host = url.hostname.toLowerCase().replace(/^www\./, "");
	if (!host.includes(".")) {
		throw new InvalidUrlError("not a public host");
	}
	const params = [...url.searchParams.entries()]
		.filter(([key]) => !TRACKING.test(key) && !TRACKING_EXACT.has(key))
		.sort(([a], [b]) => a.localeCompare(b));
	const query = new URLSearchParams(params).toString();
	const port =
		url.port && url.port !== "80" && url.port !== "443" ? `:${url.port}` : "";
	const path = url.pathname.replace(/\/+$/, "") || "";
	return `https://${host}${port}${path}${query ? `?${query}` : ""}`;
}

/** Whether `domain` is, or is a subdomain of, one of the blocked domains. */
export const isBlocked = (domain: string, blocked: readonly string[]) =>
	blocked.some((b) => domain === b || domain.endsWith(`.${b}`));
