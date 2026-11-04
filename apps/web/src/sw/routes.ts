// What the service worker handles, as pure functions so a test can pin it down (#249). The rule is
// deliberately narrow: the worker caches static assets and shows an offline page, nothing else.
// Pages, API calls (`/api`, `/rpc`, `/mcp`) and anything cross-origin pass straight through to the
// network: the data lives in the persisted query cache (IndexedDB), and a second cache here would
// serve a Member stale or someone else's content.

/** The page shown when a navigation fails for lack of network, precached at install (a route, src/app/offline). */
export const OFFLINE_URL = "/offline";

const API_PREFIXES = ["/api", "/rpc", "/mcp"];

export function isApiPath(pathname: string): boolean {
	return API_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}

/** Hashed build output: immutable, so a cached copy can never be stale. */
export function isStaticAsset(url: URL, origin: string): boolean {
	return url.origin === origin && url.pathname.startsWith("/_next/static/");
}

/** The flags of the country select and of the bylines: small, never changed once served. */
export function isFlagAsset(url: URL, origin: string): boolean {
	return url.origin === origin && /^\/flags\/[A-Z]{2}\.svg$/.test(url.pathname);
}

/** A page navigation on this origin that the worker may answer with the offline page. */
export function isPageNavigation(
	request: { mode: string },
	url: URL,
	origin: string,
): boolean {
	return (
		request.mode === "navigate" &&
		url.origin === origin &&
		!isApiPath(url.pathname) &&
		url.pathname !== OFFLINE_URL
	);
}
