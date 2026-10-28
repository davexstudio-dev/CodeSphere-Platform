import { expect, test } from "@playwright/test";

// The public roadmap (#252): readable without JavaScript, in the reader's language, with the
// community's figures from the daily snapshot and a way to propose an idea.
test.describe("without JavaScript", () => {
	test.use({ javaScriptEnabled: false, locale: "fr-FR" });

	test("the roadmap and the figures are in the page", async ({ page }) => {
		await page.goto("/roadmap");
		await expect(
			page.getByRole("heading", { level: 1, name: "Feuille de route" }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "La communauté en chiffres" }),
		).toBeVisible();
		await expect(page.getByText("Membres actifs (30 jours)")).toBeVisible();
		await expect(
			page.getByText(/Chiffres du .* mis à jour une fois par jour/),
		).toBeVisible();
		await expect(
			page.getByRole("heading", {
				name: "Phase 3 : hackathons ouverts et paiements",
			}),
		).toBeVisible();
		await expect(page.getByText("Prévu").first()).toBeVisible();
		await expect(page.getByText("Livré").first()).toBeVisible();
		await expect(page.getByText("Applications mobiles natives")).toBeVisible();
	});

	test("an idea is proposed through a Question tagged roadmap", async ({
		page,
	}) => {
		await page.goto("/roadmap");
		await expect(
			page.getByRole("link", { name: "Proposer une idée" }),
		).toHaveAttribute("href", "/ask?tag=roadmap");
	});
});

test.describe("in English", () => {
	test.beforeEach(async ({ context, baseURL }) => {
		await context.addCookies([
			{ name: "NEXT_LOCALE", value: "en", url: baseURL },
		]);
	});

	test("the page follows the reader's language", async ({ page }) => {
		await page.goto("/roadmap");
		await expect(
			page.getByRole("heading", { level: 1, name: "Roadmap" }),
		).toBeVisible();
		await expect(page.getByText("Active Members (30 days)")).toBeVisible();
		await expect(page.getByText("Delivered").first()).toBeVisible();
	});

	test("the footer links to it", async ({ page }) => {
		await page.goto("/legal/terms");
		await page
			.getByRole("navigation", { name: "Footer links" })
			.getByRole("link", { name: "Roadmap" })
			.click();
		await expect(page).toHaveURL(/\/roadmap$/);
	});

	test("the site header links to it", async ({ page }) => {
		await page.goto("/");
		await page
			.getByRole("banner")
			.getByRole("link", { name: "Roadmap" })
			.click();
		await expect(page).toHaveURL(/\/roadmap$/);
	});
});
