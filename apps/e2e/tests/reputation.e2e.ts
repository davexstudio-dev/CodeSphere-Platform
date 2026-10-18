import { type Browser, expect, type Page, test } from "@playwright/test";

import { signIn } from "../support/journeys";

// Reputation (#239): a Vote up on a Member's Question earns them 5, shown in their Settings, and
// retracting it takes the 5 back. Seeded Question #1 is Awa's (packages/db/src/seed/test-data.ts).
const AWA_QUESTION = "/questions/00000000-0000-4000-8000-000000000001";
// Another human, created at their first sign-in: Members cannot vote on their own content.
const VOTER_EMAIL = "e2e.voter@example.com";

/**
 * Awa's Reputation as her Settings show it, from a fresh session: the app keeps its queries fresh for
 * a minute and persists them, so an open page would still show the previous value.
 */
async function readReputation(browser: Browser) {
	const context = await browser.newContext();
	const page = await context.newPage();
	await signIn(page);
	await page.goto("/settings");
	const value = page
		.getByText("Réputation", { exact: true })
		.locator("xpath=following-sibling::p[1]");
	await expect(value).toBeVisible();
	const reputation = Number(await value.innerText());
	await context.close();
	return reputation;
}

/** Clicks the vote up button and waits until the outbox has sent it to the API. */
async function toggleVoteUp(page: Page) {
	const sent = page.waitForResponse(
		(r) => /\/votes\//.test(r.url()) && r.request().method() === "POST",
	);
	await page
		.getByRole("group", { name: "Voter sur la question" })
		.getByRole("button", { name: "Voter pour" })
		.click();
	expect((await sent).ok()).toBe(true);
}

test("a Vote up on her Question shows in the author's Reputation, and its retraction too", async ({
	page: voter,
	browser,
}) => {
	await signIn(voter, VOTER_EMAIL);
	await voter.goto(AWA_QUESTION);
	const up = voter
		.getByRole("group", { name: "Voter sur la question" })
		.getByRole("button", { name: "Voter pour" });
	await expect(up).toBeEnabled();
	// The database keeps the votes of every run: start from no vote.
	if ((await up.getAttribute("aria-pressed")) === "true") {
		await toggleVoteUp(voter);
	}

	const base = await readReputation(browser);

	await toggleVoteUp(voter);
	await expect(up).toHaveAttribute("aria-pressed", "true");
	expect(await readReputation(browser)).toBe(base + 5);

	await toggleVoteUp(voter);
	await expect(up).toHaveAttribute("aria-pressed", "false");
	expect(await readReputation(browser)).toBe(base);
});
