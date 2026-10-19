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
	doNotTrack?: string | null;
}): boolean {
	return env.production && !env.webdriver && env.doNotTrack !== "1";
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
