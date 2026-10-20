import { expect, test } from "@playwright/test";

import { askQuestion, signIn } from "../support/journeys";

// A Member picks their country by name (with its flag) in the settings, instead of typing an ISO
// code, and it shows as a flag next to their Question.
test("picks a country by name, and it shows as a flag", async ({ page }) => {
	await signIn(page, `e2e.country.${Date.now()}@example.com`);
	await page.goto("/settings");
	const country = page.getByRole("combobox", { name: "Pays" });

	// By name, without the accents, then by code.
	await country.fill("cote d");
	await page.getByRole("option", { name: /Côte d.Ivoire/ }).click();
	await expect(country).toHaveValue(/Côte d.Ivoire/);
	await expect(page.locator('img[src="/flags/CI.svg"]').first()).toBeVisible();

	await country.fill("bf");
	await expect(
		page.getByRole("option", { name: /Burkina Faso/ }),
	).toBeVisible();
	await country.fill("zzzz");
	await expect(page.getByText("Aucun pays trouvé.")).toBeVisible();

	// Back to Côte d'Ivoire, saved, still there after a reload.
	await country.fill("ivoire");
	await page.getByRole("option", { name: /Côte d.Ivoire/ }).click();
	await page.getByRole("button", { name: "Enregistrer" }).first().click();
	await expect(page.getByText("Réglages enregistrés.")).toBeVisible();
	await page.reload();
	await expect(page.getByRole("combobox", { name: "Pays" })).toHaveValue(
		/Côte d.Ivoire/,
	);

	// Their Question carries the flag, named for screen readers, not the code.
	await askQuestion(page, "country flag");
	await expect(
		page.getByRole("img", { name: /Côte d.Ivoire/ }).first(),
	).toBeVisible();
	await expect(page.getByText("· CI", { exact: true })).toHaveCount(0);
});
