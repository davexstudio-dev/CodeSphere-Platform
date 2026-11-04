import { expect, test } from "@playwright/test";

// The entrances of the Question page (animations): they exist by default and are switched
// off for a visitor who asks for reduced motion.
const QUESTION = "/questions/00000000-0000-4000-8000-000000000002";
const animationName = (page: import("@playwright/test").Page) =>
	page
		.locator("header#question")
		.evaluate((node) => getComputedStyle(node).animationName);

test("the Question page eases in", async ({ page }) => {
	await page.goto(QUESTION);
	await expect.poll(() => animationName(page)).toBe("motion-rise");
});

test.describe("reduced motion", () => {
	test.use({ reducedMotion: "reduce" });

	test("the Question page does not animate", async ({ page }) => {
		await page.goto(QUESTION);
		await expect(page.locator("header#question")).toBeVisible();
		expect(await animationName(page)).toBe("none");
	});
});
