// Real-user Web Vitals (#251): each browser reports LCP, INP, CLS, FCP and TTFB once, as `{ name,
// value }` to the API's beacon, which counts it by country. No identifier, no URL, no cookie.

/** What is sent for a metric: its name and value, nothing else. */
export function vitalBody(metric: { name: string; value: number }): string {
	return JSON.stringify({ name: metric.name, value: metric.value });
}

/** Whether this browser should report at all: not in development, not an automated browser, not under Do Not Track. */
export function shouldReport(env: {
	production: boolean;
	webdriver?: boolean;
	/** `navigator.doNotTrack`, `window.doNotTrack` and `navigator.msDoNotTrack`: "1" or "yes" means do not track. */
	doNotTrack?: (string | null | undefined)[];
	/** Global Privacy Control (`navigator.globalPrivacyControl`). */
	globalPrivacyControl?: boolean;
}): boolean {
	const refused =
		env.doNotTrack?.some((v) => v === "1" || v === "yes") ?? false;
	return (
		env.production && !env.webdriver && !refused && !env.globalPrivacyControl
	);
}

/** Sends one report without delaying the page: `sendBeacon` survives the page closing; else `fetch` with keepalive. */
export function sendVital(url: string, body: string): void {
	// text/plain: a "simple" request, so no CORS preflight on a cross-origin API.
	if (navigator.sendBeacon?.(url, new Blob([body], { type: "text/plain" }))) {
		return;
	}
	void fetch(url, {
		method: "POST",
		body,
		headers: { "content-type": "text/plain" },
		keepalive: true,
	}).catch(() => undefined);
}
