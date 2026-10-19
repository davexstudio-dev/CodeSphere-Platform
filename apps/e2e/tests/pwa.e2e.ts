import { expect, test } from "@playwright/test";

// The installable web app (#249): the service worker registers, caches static chunks and the
// offline page only, and a navigation without network shows the offline page. Needs a production
// build (the worker is not registered under `next dev`), as CI runs with `next start`.
test.skip(
	!process.env.E2E_WEB_COMMAND,
	"the service worker is registered by production builds only",
);

test("the manifest and icons are served", async ({ request }) => {
	const response = await request.get("/manifest.webmanifest");
	expect(response.ok()).toBe(true);
	const manifest = await response.json();
	expect(manifest.display).toBe("standalone");
	for (const icon of manifest.icons as { src: string }[]) {
		expect((await request.get(icon.src)).ok()).toBe(true);
	}
});

test("the worker caches static chunks and the offline page, never pages or API calls", async ({
	page,
}) => {
	await page.goto("/legal/terms");
	await page.evaluate(async () => {
		const registration = await navigator.serviceWorker.ready;
		const worker = registration.active;
		if (worker && worker.state !== "activated") {
			await new Promise<void>((resolve) =>
				worker.addEventListener(
					"statechange",
					() => worker.state === "activated" && resolve(),
				),
			);
		}
	});
	await page.reload();
	expect(
		await page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
	).toBe(true);

	const cached = await page.evaluate(async () => {
		const urls: string[] = [];
		for (const name of await caches.keys()) {
			const cache = await caches.open(name);
			for (const request of await cache.keys()) {
				urls.push(new URL(request.url).pathname);
			}
		}
		return urls;
	});
	expect(cached).toContain("/offline");
	expect(cached.some((path) => path.startsWith("/_next/static/"))).toBe(true);
	// Nothing but those two kinds: the data lives in the persisted query cache, not here.
	expect(
		cached.filter(
			(path) => path !== "/offline" && !path.startsWith("/_next/static/"),
		),
	).toEqual([]);
});

test("a navigation without network shows the offline page", async ({
	page,
	context,
}) => {
	await page.goto("/legal/terms");
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload(); // now controlled by the worker
	await context.setOffline(true);
	await page
		.goto("/questions/00000000-0000-4000-8000-000000000000")
		.catch(() => undefined);
	await expect(
		page.getByRole("heading", { name: "Vous êtes hors ligne" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "You are offline" }),
	).toBeVisible();
	await context.setOffline(false);
});
