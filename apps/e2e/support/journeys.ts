import { expect, type Locator, type Page } from "@playwright/test";

import { readSignInCode } from "./otp";

// Awa Seed, the human of the deterministic test data (packages/db/src/seed/test-data.ts).
export const SEED_EMAIL = "awa.seed@example.com";

/** Signs in through the sign-in page with an email code, as a Member would. */
export async function signIn(page: Page, email = SEED_EMAIL) {
	await page.goto("/signin");
	const form = page.getByRole("form", { name: "Connexion par code email" });
	await page.getByRole("checkbox").check();
	await form.getByPlaceholder("vous@exemple.com").fill(email);
	await form.getByRole("button", { name: "Envoyer le code" }).click();
	const codeField = form.getByLabel("Code reçu par email");
	await expect(codeField).toBeVisible();
	await codeField.fill(await readSignInCode(email));
	await form.getByRole("button", { name: "Valider le code" }).click();
	await expect(page).not.toHaveURL(/\/signin/);
}

/** A title no earlier run used: the database keeps the Questions of every run. */
export function uniqueTitle(label: string) {
	return `E2E ${label} ${Date.now()} : comment tester un parcours complet ?`;
}

/** Fills the four steps of /ask up to the review, without publishing. */
export async function fillQuestion(page: Page, title: string) {
	// ?tag= prefills the Tags step.
	await page.goto("/ask?tag=api");
	await page.getByRole("textbox", { name: "Titre" }).fill(title);
	await page.getByRole("button", { name: "Continuer" }).click();
	await page
		.getByRole("textbox", { name: "Détails" })
		.fill("Contexte du test de bout en bout, avec assez de détails.");
	await page.getByRole("button", { name: "Continuer" }).click();
	await page.getByRole("button", { name: "Continuer" }).click();
	await expect(
		page.getByRole("button", { name: "Publier la question" }),
	).toBeVisible();
}

/** Asks a fresh Question through /ask and returns its page path (`/questions/<id>`). */
export async function askQuestion(page: Page, label: string) {
	const title = uniqueTitle(label);
	await fillQuestion(page, title);
	await publishQuestion(page, title);
	return { title, path: new URL(page.url()).pathname };
}

/** Publishes the Question under review and waits for its page. */
export async function publishQuestion(page: Page, title: string) {
	await page.getByRole("button", { name: "Publier la question" }).click();
	await expect(page).toHaveURL(/\/questions\/[0-9a-f-]{36}/);
	await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

/** Picks a country in a country select by typing part of its name, then choosing the option. */
export async function pickCountry(
	page: Page,
	field: Locator,
	query: string,
	name: RegExp,
) {
	await field.fill(query);
	await page.getByRole("option", { name }).click();
}
