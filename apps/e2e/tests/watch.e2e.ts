import { expect, type Page, test } from "@playwright/test";

import { setFollowedTags } from "../support/follows";
import { SEED_EMAIL, signIn } from "../support/journeys";
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
	// The link goes through the redirect that counts the click.
	await expect(card.getByRole("link", { name: TITLE })).toHaveAttribute(
		"href",
		/\/api\/v1\/watch\/out\/[0-9a-f-]{36}$/,
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

// The single « Pour toi » feed (#256): a watch item on a followed Tag is in it with its reason, and
// « Moins comme ça » hides its Source until the Member takes that back in the settings.
// A new account is first offered the Tags onboarding; the Member skips it, as the feed e2e does.
async function skipTagsOnboarding(page: Page) {
	await page.goto("/onboarding/tags");
	await page.getByRole("button", { name: "Passer" }).click();
	await page.goto("/");
}

test.describe("« Pour toi » feed", () => {
	test.beforeEach(() => setFollowedTags(SEED_EMAIL, ["web"]));
	test.afterEach(() => setFollowedTags(SEED_EMAIL, []));

	test("explains a card, hides a Source, and gives it back from the settings", async ({
		page,
	}) => {
		const title = `Fil mixte ${run}`;
		const source = `Mixte ${run}`;
		await seedWatchItem({
			title,
			url: `https://e2e-watch.example.com/mixte-${run}`,
			sourceName: source,
		});
		await signIn(page);
		await skipTagsOnboarding(page);
		const card = page.getByRole("article").filter({ hasText: title });
		await expect(card).toBeVisible();
		await expect(page.getByText("vous suivez web").first()).toBeVisible();

		await page
			.getByRole("button", { name: `Moins de ${source}` })
			.first()
			.click();
		await expect(card).toHaveCount(0);

		await page.goto("/settings?tab=tags");
		await expect(page.getByText(source)).toBeVisible();
		await page
			.getByRole("button", { name: `Ne plus masquer ${source}` })
			.click();
		await expect(page.getByText(source)).toHaveCount(0);
		await page.goto("/");
		await expect(
			page.getByRole("article").filter({ hasText: title }),
		).toBeVisible();
	});

	test("without personalisation the feed keeps the followed Tags only", async ({
		page,
	}) => {
		await signIn(page);
		await skipTagsOnboarding(page);
		await page.goto("/settings?tab=tags");
		const toggle = page.getByRole("switch", { name: "Personnaliser mon fil" });
		// Disabled until the preferences are loaded: a click before is ignored.
		await expect(toggle).toBeEnabled();
		await toggle.click();
		await expect(toggle).not.toBeChecked();
		await page.goto("/");
		await expect(page.getByText("vous suivez web").first()).toBeVisible();
		await page.goto("/settings?tab=tags");
		const back = page.getByRole("switch", { name: "Personnaliser mon fil" });
		await expect(back).toBeEnabled();
		await back.click();
		await expect(back).toBeChecked();
	});
});
