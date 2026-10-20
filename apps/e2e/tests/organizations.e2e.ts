import { expect, test } from "@playwright/test";

import { pickCountry, signIn } from "../support/journeys";

// Organizations (#257): a Member applies, an Admin validates, the public profile appears, and a
// refused address or a rejection is explained to the applicant.
const ADMIN_EMAIL = "e2e.admin@example.com";
const run = Date.now().toString(36);
const NAME = `Atelier Test ${run}`;
const HOST = `atelier-${run}.example.org`;

test("a Member applies, an Admin validates, the public profile appears", async ({
	browser,
	baseURL,
}) => {
	const member = await (await browser.newContext({ baseURL })).newPage();
	await signIn(member, `org.member.${run}@example.com`);
	await member.goto("/organizations/new");
	await member.getByLabel("Nom", { exact: true }).fill(NAME);
	await member.getByLabel("Site web").fill(`https://www.${HOST}`);
	await member
		.getByLabel("E-mail sur le domaine de l'Organisation")
		.fill("someone@gmail.com");
	await pickCountry(
		member,
		member.getByLabel("Pays", { exact: true }),
		"senegal",
		/Sénégal/,
	);
	await member.getByRole("button", { name: "Envoyer la demande" }).click();
	await expect(
		member.getByText(/doit être sur le domaine du site web/),
	).toBeVisible();

	await member
		.getByLabel("E-mail sur le domaine de l'Organisation")
		.fill(`contact@${HOST}`);
	await member.getByRole("button", { name: "Envoyer la demande" }).click();
	await expect(member.getByText("Demande envoyée")).toBeVisible();
	const mine = member.getByRole("listitem").filter({ hasText: NAME });
	await expect(mine.getByText("En attente")).toBeVisible();

	// Invisible to the public while pending.
	const slug = `atelier-test-${run}`;
	expect((await member.request.get(`/organizations/${slug}`)).status()).toBe(
		404,
	);

	const admin = await (await browser.newContext({ baseURL })).newPage();
	await signIn(admin, ADMIN_EMAIL);
	await admin.goto("/admin/organizations");
	const card = admin.getByRole("listitem").filter({ hasText: NAME });
	await expect(card).toBeVisible();
	await expect(card.getByText(`contact@${HOST}`)).toBeVisible();
	await card.getByRole("button", { name: "Valider" }).click();
	await expect(card).toHaveCount(0);

	await member.goto(`/organizations/${slug}`);
	await expect(member.getByRole("heading", { name: NAME })).toBeVisible();
	await expect(member.getByText(HOST)).toBeVisible();
	// The contact email stays private.
	await expect(member.getByText(`contact@${HOST}`)).toHaveCount(0);

	await member.goto("/organizations");
	await expect(member.getByRole("link", { name: NAME })).toBeVisible();
});

test("the CADEV is organized by a validated Organization with its own profile", async ({
	page,
}) => {
	await page.goto("/hackathons/cadev-2026");
	const link = page.getByRole("link", { name: "Systalink" }).first();
	await expect(link).toBeVisible();
	await link.click();
	await expect(page).toHaveURL(/\/organizations\/systalink$/);
	await expect(page.getByRole("heading", { name: "Systalink" })).toBeVisible();
});
