import { expect, test } from "@playwright/test";

test("an unknown address answers 404 and leads back home", async ({ page }) => {
	const response = await page.goto("/cette-page-n-existe-pas");
	expect(response?.status()).toBe(404);
	await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
	await page.locator('[data-slot="dithering-404"] a[href="/"]').click();
	await expect(page).toHaveURL(/\/$/);
});
