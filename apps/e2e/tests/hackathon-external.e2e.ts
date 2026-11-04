import { expect, test } from "@playwright/test";

import { seedOpenHackathon } from "../support/hackathon";

// A Hackathon whose registration lives elsewhere (the CADEV: Systalink's Datacloud) does not offer
// teams here: no team or gallery tab, and a link to the organiser's page instead. One that runs its
// teams on CodeSphere keeps its tabs.
const OPEN = "e2e-teams-on";

test.beforeAll(async () => {
	await seedOpenHackathon(OPEN, "Hackathon avec équipes");
});

test("the CADEV points to the organiser instead of offering teams", async ({
	page,
}) => {
	await page.goto("/hackathons/cadev-2026");
	await expect(page.getByRole("tab", { name: "Frise" })).toBeVisible();
	await expect(page.getByRole("tab", { name: "Mon équipe" })).toHaveCount(0);
	await expect(page.getByRole("tab", { name: "Galerie" })).toHaveCount(0);
	const link = page.getByRole("link", {
		name: "Aller au site de l'organisateur",
	});
	await expect(link).toHaveAttribute("href", /systalink\.com/);
	// A link to a hidden tab falls back to the overview.
	await page.goto("/hackathons/cadev-2026?tab=team");
	await expect(
		page.getByRole("heading", {
			name: "Inscription et dépôt chez l'organisateur",
		}),
	).toBeVisible();
});

test("a Hackathon that runs its teams here keeps their tabs", async ({
	page,
}) => {
	await page.goto(`/hackathons/${OPEN}`);
	await expect(page.getByRole("tab", { name: "Mon équipe" })).toBeVisible();
	await expect(page.getByRole("tab", { name: "Galerie" })).toBeVisible();
	await expect(
		page.getByRole("link", { name: "Aller au site de l'organisateur" }),
	).toHaveCount(0);
});
