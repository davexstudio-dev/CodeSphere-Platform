import { expect, test } from "@playwright/test";

import { signIn } from "../support/journeys";
import { seedWatchItem } from "../support/watch";

// The watch feed (#255): anyone reads trusted Sources' links; a Member keeps one for later and
// proposes a link, which waits for a vote.
const run = crypto.randomUUID().slice(0, 8);
const TITLE = `Guide du web ${run}`;

test.beforeAll(async () => {
	await seedWatchItem({
		title: TITLE,
		url: `https://e2e-watch.example.com/guide-${run}`,
		sourceName: `Blog ${run}`,
	});
});

test("a visitor reads the feed and is asked to sign in to vote", async ({
	page,
}) => {
	await page.goto("/watch");
	const card = page.getByRole("article").filter({ hasText: TITLE });
	await expect(card).toBeVisible();
	await expect(card.getByRole("link", { name: TITLE })).toHaveAttribute(
		"href",
		`https://e2e-watch.example.com/guide-${run}`,
	);
	await expect(card.getByText(`Blog ${run}`)).toBeVisible();
	await expect(card.getByText("Source africaine")).toBeVisible();
	await expect(card.getByText("web", { exact: true })).toBeVisible();
	await card.getByRole("button", { name: "Voter pour" }).click();
	await expect(page.getByRole("dialog")).toBeVisible();
});

test("a Member keeps an item for later and proposes a link", async ({
	page,
}) => {
	await signIn(page);
	await page.goto("/watch");
	const card = page.getByRole("article").filter({ hasText: TITLE });
	await card.getByRole("button", { name: "Garder pour plus tard" }).click();
	await expect(card.getByRole("button", { name: "Gardé" })).toBeVisible();

	await page.getByRole("button", { name: "Gardés" }).click();
	await expect(
		page.getByRole("article").filter({ hasText: TITLE }),
	).toBeVisible();

	const proposed = `https://proposal.example.com/post-${run}`;
	await page.getByLabel("Adresse du lien").fill(proposed);
	await page.getByLabel("Titre", { exact: true }).fill(`Proposition ${run}`);
	await page.getByRole("button", { name: "Proposer", exact: true }).click();
	await expect(
		page.getByText("Votre proposition attend un vote"),
	).toBeVisible();
	await expect(
		page.getByRole("article").filter({ hasText: `Proposition ${run}` }),
	).toBeVisible();
	await expect(page.getByText("En attente de vote").first()).toBeVisible();
});
