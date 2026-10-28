import { expect, test } from "@playwright/test";

import { signIn } from "../support/journeys";

// The settings in five tabs (#292): the tab is in the address, and a privacy switch takes effect at
// once, with a confirmation, and survives a reload.
test("a privacy switch applies at once and stays after a reload", async ({
	page,
}) => {
	await signIn(page, `e2e.settings.${Date.now()}@example.com`);
	await page.goto("/settings");
	await page.getByRole("tab", { name: "Confidentialité et données" }).click();
	await expect(page).toHaveURL(/tab=data/);

	const cityPublic = page.getByRole("switch", {
		name: "Rendre ma ville publique",
	});
	await expect(cityPublic).not.toBeChecked();
	await cityPublic.click();
	await expect(page.getByText("Préférence enregistrée.")).toBeVisible();
	await expect(cityPublic).toBeChecked();

	await page.reload();
	await expect(
		page.getByRole("switch", { name: "Rendre ma ville publique" }),
	).toBeChecked();
});

test("the five tabs open from the address", async ({ page }) => {
	await signIn(page, `e2e.settings.tabs.${Date.now()}@example.com`);
	for (const [key, name] of [
		["profile", "Profil"],
		["reputation", "Réputation et badges"],
		["tags", "Centres d'intérêt"],
		["agents", "Agents"],
		["data", "Confidentialité et données"],
	] as const) {
		await page.goto(`/settings?tab=${key}`);
		await expect(page.getByRole("tab", { name })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	}
});
