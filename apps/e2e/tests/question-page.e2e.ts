import {
	type Browser,
	expect,
	type Locator,
	type Page,
	test,
} from "@playwright/test";

import { insertAgentAnswer } from "../support/answers";
import { askQuestion, signIn } from "../support/journeys";

// The Question page end to end (#69): what a visitor reads, then everything a Member does on it.
// Labels are the fr-FR ones; english.e2e.ts checks the English interface (#208).
const SEEDED_QUESTION = "/questions/00000000-0000-4000-8000-000000000002";

const answerBox = (page: Page) =>
	page.getByRole("textbox", { name: "Votre réponse en Markdown" });
const publishAnswer = (page: Page) =>
	page.getByRole("button", { name: "Publier la réponse" });
const confirm = (page: Page) =>
	page.getByRole("button", { name: /^Confirmer/ });
// An Agent's answer that no human other than its Owner has voted up stays folded (#244). The
// viewer here is the Owner (the seed Member), so it stays folded whatever they do: open it.
async function openFolded(page: Page) {
	// The answers load after the page: wait for the fold rather than counting what is there now.
	await page
		.locator("details > summary")
		.filter({ hasText: "agent" })
		.first()
		.click();
}
const answerCard = (page: Page, body: string) =>
	page.locator("article").filter({ hasText: body });
const answerVotes = (card: Locator) => {
	const group = card.getByRole("group", { name: "Vote" });
	return {
		up: group.getByRole("button", { name: "Voter pour" }),
		down: group.getByRole("button", { name: "Voter contre" }),
		score: group.locator("[aria-live]"),
	};
};
/**
 * A new browser context, so with no offline cache: the page then shows what the server holds,
 * not what this browser saw before. Signed in as the seeded Member unless `visitor`.
 */
async function freshPage(
	browser: Browser,
	baseURL: string | undefined,
	visitor = false,
) {
	const context = await browser.newContext({ baseURL, locale: "fr-FR" });
	const page = await context.newPage();
	if (!visitor) {
		await signIn(page);
	}
	return page;
}

/** The « En bref » count of Answers. */
const answerCount = (page: Page) =>
	page
		.locator("dt", { hasText: "Réponses" })
		.locator("xpath=following-sibling::dd[1]");

// The path to the page and the jump links to its sections (#212).
const breadcrumb = (page: Page) =>
	page.getByRole("navigation", { name: "Fil d'Ariane" });
const steps = (page: Page) =>
	page.getByRole("navigation", { name: "Sections de cette question" });

test.describe("a visitor", () => {
	test("reads a question but can neither answer nor vote", async ({ page }) => {
		await page.goto(SEEDED_QUESTION);
		await expect(
			page.getByRole("heading", {
				name: "How do I deploy a Next.js app to Cloudflare Workers?",
			}),
		).toBeVisible();
		await expect(page.getByText("#nextjs").first()).toBeVisible();
		await expect(
			page.getByText("The build works locally but the Worker is too large."),
		).toBeVisible();
		await expect(page.getByText("En bref")).toBeVisible();

		await expect(
			page.getByText("Connectez-vous pour répondre et voter."),
		).toBeVisible();
		await expect(answerBox(page)).toHaveCount(0);
		await expect(page.getByRole("button", { name: "Modifier" })).toHaveCount(0);
		const votes = page.getByRole("group", { name: "Voter sur la question" });
		await expect(
			votes.getByRole("button", { name: "Voter pour" }),
		).toBeDisabled();
		await expect(
			votes.getByRole("button", { name: "Voter contre" }),
		).toBeDisabled();

		// The breadcrumb ends on the question; a visitor gets the three steps, the last one
		// leading to the invitation to sign in.
		await expect(breadcrumb(page).locator('[aria-current="page"]')).toHaveText(
			"How do I deploy a Next.js app to Cloudflare Workers?",
		);
		await expect(steps(page).getByRole("link")).toHaveText([
			/Question$/,
			/Réponses \(0\)$/,
			/Ma réponse$/,
		]);
		await breadcrumb(page).getByRole("link", { name: "Accueil" }).click();
		await expect(page).toHaveURL(/\/$/);
		await page.goBack();
		await expect(
			page.getByText("Connectez-vous pour répondre et voter."),
		).toBeVisible();

		await page.getByRole("button", { name: "Se connecter" }).first().click();
		// A sign-in dialog opens over the page: the visitor stays on the question.
		const dialog = page.getByRole("dialog", { name: "Se connecter" });
		await expect(
			dialog.getByRole("form", { name: "Connexion par code email" }),
		).toBeVisible();
		await expect(page).toHaveURL(new RegExp(`${SEEDED_QUESTION}$`));
	});
});

test.describe("a member", () => {
	test.beforeEach(async ({ page }) => {
		await signIn(page);
	});

	test("answers, sees the answer kept after a reload, then deletes it", async ({
		page,
	}) => {
		await askQuestion(page, "réponse");
		await expect(
			page.getByText("Pas encore de réponse. Soyez le premier à aider."),
		).toBeVisible();
		await expect(answerCount(page)).toHaveText("0");

		// Steps of an open question the Member can answer; « Ma réponse » jumps to the form.
		await expect(steps(page).getByRole("link")).toHaveText([
			/Question$/,
			/Réponses \(0\)$/,
			/Ma réponse$/,
		]);
		await steps(page).getByRole("link", { name: "Ma réponse" }).click();
		await expect(answerBox(page)).toBeInViewport();
		await expect(
			steps(page).getByRole("link", { name: "Ma réponse" }),
		).toHaveAttribute("aria-current", "location");

		const body = "Réponse E2E : vérifier la signature avant de traiter.";
		await answerBox(page).fill(body);
		await publishAnswer(page).click();
		const card = answerCard(page, body);
		await expect(card).toBeVisible();
		await expect(answerCount(page)).toHaveText("1");
		// Answered: the reply step is gone and the answers step counts the answer.
		await expect(steps(page).getByRole("link")).toHaveText([
			/Question$/,
			/Réponses \(1\)$/,
		]);
		await expect(
			page.getByText("Pas encore de réponse. Soyez le premier à aider."),
		).toHaveCount(0);
		// One answer per Member: the form is gone, and one's own answer takes no vote.
		await expect(answerBox(page)).toHaveCount(0);
		await expect(answerVotes(card).up).toBeDisabled();

		await page.reload();
		await expect(answerCard(page, body)).toBeVisible();

		await page.getByRole("button", { name: "Supprimer ma réponse…" }).click();
		await confirm(page).click();
		await expect(answerCard(page, body)).toHaveCount(0);
		await expect(answerCount(page)).toHaveText("0");
		await page.reload();
		await expect(
			page.getByText("Pas encore de réponse. Soyez le premier à aider."),
		).toBeVisible();
		await expect(answerBox(page)).toBeVisible();
	});

	test("votes on an agent's answer, then accepts it", async ({
		page: author,
		browser,
		baseURL,
	}) => {
		const { path } = await askQuestion(author, "agent");
		const body =
			"Réponse de l'agent E2E : signer le corps brut en HMAC-SHA256.";
		await insertAgentAnswer(path.split("/").pop() ?? "", body);
		// The author's browser cached this page without the answer: read it from a fresh one.
		const page = await freshPage(browser, baseURL);
		await page.goto(path);

		// An Agent's answer no human has voted up yet stays folded (#244): open it.
		await openFolded(page);
		const card = answerCard(page, body);
		await expect(card).toBeVisible();
		await expect(card.getByText("◆ agent de Awa Seed")).toBeVisible();

		const votes = answerVotes(card);
		await expect(votes.up).toBeEnabled();
		await expect(votes.score).toHaveText("0");
		const sent = page.waitForResponse(
			(r) => /\/votes\//.test(r.url()) && r.request().method() === "POST",
		);
		await votes.up.click();
		expect((await sent).ok()).toBe(true);
		await expect(votes.up).toHaveAttribute("aria-pressed", "true");
		await expect(votes.score).toHaveText("1");
		await page.reload();
		await openFolded(page);
		await expect(answerVotes(answerCard(page, body)).score).toHaveText("1");

		await answerCard(page, body)
			.getByRole("button", { name: "Accepter" })
			.click();
		await openFolded(page);
		await expect(page.getByText("Réponse acceptée").first()).toBeVisible();
		await expect(page.getByText("Résolue").first()).toBeVisible();
		await page.reload();
		await openFolded(page);
		await expect(page.getByText("Réponse acceptée").first()).toBeVisible();
		await expect(page.getByRole("button", { name: "Accepter" })).toHaveCount(0);
	});

	test("edits the question, then closes and reopens it", async ({ page }) => {
		const { title } = await askQuestion(page, "modification");

		await page.getByRole("button", { name: "Modifier" }).click();
		await page.locator("#edit-title").fill("Titre jamais enregistré");
		await page.getByRole("button", { name: "Annuler" }).click();
		await expect(page.getByRole("heading", { name: title })).toBeVisible();

		const edited = `${title} (modifiée)`;
		await page.getByRole("button", { name: "Modifier" }).click();
		await page.locator("#edit-title").fill(edited);
		await page.locator("#edit-tags").fill("postgres");
		await page.locator("#edit-tags").press("Enter");
		await page.getByRole("button", { name: "Enregistrer" }).click();
		await expect(page.getByText("Question modifiée.")).toBeVisible();

		await page.reload();
		await expect(page.getByRole("heading", { name: edited })).toBeVisible();
		await expect(page.getByText("#postgres").first()).toBeVisible();

		// The same question is then closed and reopened: the API allows 10 new Questions an hour
		// per Member (#72), and every journey of the suite draws on that budget.
		await expect(answerBox(page)).toBeVisible();
		await page.getByRole("button", { name: "Fermer" }).click();
		await expect(
			page.getByText(
				"Cette question est fermée : elle ne reçoit plus de réponse.",
			),
		).toBeVisible();
		await expect(page.getByText("Fermée").first()).toBeVisible();
		await expect(answerBox(page)).toHaveCount(0);

		await page.reload();
		await page.getByRole("button", { name: "Rouvrir" }).click();
		await expect(page.getByText("Ouverte").first()).toBeVisible();
		await expect(answerBox(page)).toBeVisible();
	});

	test("deletes the question, which is then gone", async ({
		page,
		browser,
		baseURL,
	}) => {
		const { path } = await askQuestion(page, "suppression");

		await page.getByRole("button", { name: "Supprimer la question…" }).click();
		await confirm(page).click();
		await expect(page.getByText("Question supprimée.")).toBeVisible();
		await expect(page).toHaveURL(/\/$/);

		// Gone for everyone: a visitor with no cache gets « introuvable ».
		const visitor = await freshPage(browser, baseURL, true);
		await visitor.goto(path);
		await expect(visitor.getByText("Question introuvable")).toBeVisible();
	});
});
