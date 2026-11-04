import { expect, test } from "@playwright/test";

import { vitalSamples } from "../support/vitals";

// Real-user Web Vitals (#251): a visitor's browser reports its metrics to the API once the page is
// hidden, and each report only increments a counter. Needs a production build (reporting is off in
// development), as CI runs with `next start`.
test.skip(
	!process.env.E2E_WEB_COMMAND,
	"Web Vitals are reported by production builds only",
);

test("a visit reports its metrics, which are counted without a cookie", async ({
	page,
	context,
}) => {
	// Playwright announces itself as an automated browser, which the reporter skips on purpose.
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "webdriver", { get: () => false });
	});
	const before = await vitalSamples("TTFB");
	const beacons: string[] = [];
	page.on("request", (request) => {
		if (
			request.url().endsWith("/api/v1/vitals") &&
			request.method() === "POST"
		) {
			beacons.push(request.postData() ?? "");
		}
	});

	await page.goto("/");
	await page.waitForLoadState("networkidle");
	// web-vitals reports LCP, INP and CLS when the page is hidden.
	await page.evaluate(() => {
		Object.defineProperty(document, "visibilityState", {
			value: "hidden",
			configurable: true,
		});
		document.dispatchEvent(new Event("visibilitychange"));
	});
	await expect
		.poll(() => beacons.length, { timeout: 15_000 })
		.toBeGreaterThan(0);

	// The body of a beacon is not readable from the test (a Blob); that it is only a name and a
	// value is pinned by the unit tests and by the server's own test.
	await expect
		.poll(() => vitalSamples("TTFB"), { timeout: 15_000 })
		.toBeGreaterThan(before);
	// No cookie was set for it.
	expect((await context.cookies()).map((c) => c.name)).not.toContain(
		"web-vitals",
	);
});
