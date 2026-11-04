import { expect, type Page, test } from "@playwright/test";

// Data saver mode (#250): on with the browser's `Save-Data: on` header, or by the Member's choice.
// Needs a production build (Next prefetches links in production only), as
// CI runs with `next start`.
test.skip(
	!process.env.E2E_WEB_COMMAND,
	"link prefetching and fonts are production behaviour",
);

async function withSaveData(page: Page, value: string) {
	// As a browser does: on every request to the site itself (pages, scripts, the server render
	// behind a refresh), never on the API's origin, where it would be an unexpected request header.
	const site = test.info().project.use.baseURL ?? "";
	await page.route("**/*", (route) => {
		const request = route.request();
		if (request.url().startsWith(site)) {
			return route.continue({
				headers: { ...request.headers(), "save-data": value },
			});
		}
		return route.continue();
	});
}

/** What a page load asks the network for. */
async function observe(page: Page) {
	const seen = { fonts: 0, prefetches: 0, limits: [] as number[] };
	page.on("request", (request) => {
		if (request.resourceType() === "font") seen.fonts++;
		if (request.headers()["next-router-prefetch"]) seen.prefetches++;
		const sent = `${request.url()} ${request.postData() ?? ""}`;
		if (/\/rpc\//.test(request.url())) {
			const limit =
				/"limit":(\d+)/.exec(sent)?.[1] ?? /limit%22%3A(\d+)/.exec(sent)?.[1];
			if (limit) seen.limits.push(Number(limit));
		}
	});
	return seen;
}

test("without Save-Data the page loads fonts, prefetches links and asks for full pages", async ({
	page,
}) => {
	await withSaveData(page, "off");
	const seen = await observe(page);
	await page.goto("/");
	await page.waitForLoadState("networkidle");
	await expect(page.locator("html")).not.toHaveAttribute(
		"data-data-saver",
		"true",
	);
	expect(seen.fonts).toBeGreaterThan(0);
	expect(seen.prefetches).toBeGreaterThan(0);
	expect(seen.limits).toContain(20);
});

test("with Save-Data: on the page has system fonts, no prefetch, no animation and half pages", async ({
	page,
}) => {
	await withSaveData(page, "on");
	const seen = await observe(page);
	await page.goto("/");
	await page.waitForLoadState("networkidle");
	await expect(page.locator("html")).toHaveAttribute("data-data-saver", "true");
	expect(seen.fonts).toBe(0);
	expect(seen.prefetches).toBe(0);
	expect(seen.limits.length).toBeGreaterThan(0);
	expect(seen.limits.every((limit) => limit === 10)).toBe(true);
	// No transition: a button's duration is zero.
	const duration = await page
		.getByRole("button")
		.first()
		.evaluate((element) => getComputedStyle(element).transitionDuration);
	expect(duration).toBe("0s");
	// System fonts only: the brand font variables point at the system stack, so the text is sans
	// serif (an undefined variable would invalidate font-family and give a serif).
	const { variable, family } = await page.evaluate(() => ({
		variable: getComputedStyle(document.documentElement).getPropertyValue(
			"--font-outfit",
		),
		family: getComputedStyle(document.body).fontFamily,
	}));
	expect(variable.trim()).toBe("ui-sans-serif");
	expect(family).toMatch(/ui-sans-serif|system-ui/);
});

test("the Member's choice wins over the header, and is remembered", async ({
	page,
	context,
}) => {
	await withSaveData(page, "on");
	await page.goto("/");
	await expect(page.locator("html")).toHaveAttribute("data-data-saver", "true");
	// "Désactivé" turns it off although the browser asks for it.
	await page.getByRole("tab", { name: "Désactivé" }).click();
	await expect(page.locator("html")).not.toHaveAttribute(
		"data-data-saver",
		"true",
	);
	const cookie = (await context.cookies()).find((c) => c.name === "data-saver");
	expect(cookie?.value).toBe("off");
	await page.reload();
	await expect(page.locator("html")).not.toHaveAttribute(
		"data-data-saver",
		"true",
	);
	// "Auto" follows the browser again.
	await page.getByRole("tab", { name: "Auto" }).click();
	await expect(page.locator("html")).toHaveAttribute("data-data-saver", "true");
	expect(
		(await context.cookies()).find((c) => c.name === "data-saver"),
	).toBeUndefined();
});
