import { expect, test } from "@playwright/test";

import { seedOpenHackathon } from "../support/hackathon";
import { signIn } from "../support/journeys";

// Teams and Submissions (#261): a captain creates a team and shares the link, a Member joins with it,
// the team saves its submission; the gallery stays closed until the deadline.
const run = Date.now().toString(36);
const SLUG = `e2e-open-${run}`;

test("create a team, join by link, submit a project", async ({
	browser,
	baseURL,
}) => {
	await seedOpenHackathon(SLUG, `Hackathon ouvert ${run}`);
	const captain = await (await browser.newContext({ baseURL })).newPage();
	await signIn(captain, `team.captain.${run}@example.com`);
	await captain.goto(`/hackathons/${SLUG}?tab=team`);
	await captain.getByLabel("Nom de l'équipe").fill(`Les Bâtisseurs ${run}`);
	await captain.getByRole("button", { name: "Créer l'équipe" }).click();
	await expect(
		captain.getByRole("heading", { name: `Les Bâtisseurs ${run}` }),
	).toBeVisible();
	await expect(captain.getByText("1 sur 3 membres")).toBeVisible();
	const link = await captain.getByLabel("Lien d'invitation").inputValue();
	expect(link).toMatch(/\/teams\/join\/[A-Za-z0-9_-]{32}$/);

	const mate = await (await browser.newContext({ baseURL })).newPage();
	await signIn(mate, `team.mate.${run}@example.com`);
	await mate.goto(new URL(link).pathname);
	await mate.getByRole("button", { name: "Rejoindre l'équipe" }).click();
	await expect(mate).toHaveURL(new RegExp(`/hackathons/${SLUG}\\?tab=team`));
	await expect(mate.getByText("2 sur 3 membres")).toBeVisible();
	// Already in a team: a second join with the same link is refused.
	await mate.goto(new URL(link).pathname);
	await mate.getByRole("button", { name: "Rejoindre l'équipe" }).click();
	await expect(mate.locator("p[role=alert]")).toContainText(
		"déjà dans une équipe",
	);

	await captain.goto(`/hackathons/${SLUG}?tab=team`);
	await captain.getByLabel("Titre du projet").fill(`Projet ${run}`);
	await captain
		.getByLabel(/Description \(Markdown/)
		.fill(
			"Une application de paiement hors ligne pour les marchés de quartier.",
		);
	await captain
		.getByLabel("Lien du dépôt")
		.fill("https://github.com/acme/projet");
	await captain
		.getByLabel("Lien de la démo")
		.fill("https://projet.example.com");
	await captain
		.getByRole("button", { name: "Enregistrer la soumission" })
		.click();
	await expect(captain.getByText("Soumission enregistrée.")).toBeVisible();

	// The teammate sees it too, and may edit it.
	await mate.goto(`/hackathons/${SLUG}?tab=team`);
	await expect(mate.getByLabel("Titre du projet")).toHaveValue(`Projet ${run}`);

	// Before the deadline, nobody sees a gallery.
	await captain.goto(`/hackathons/${SLUG}?tab=gallery`);
	await expect(
		captain.getByText("La galerie s'ouvre à la date limite"),
	).toBeVisible();
});
