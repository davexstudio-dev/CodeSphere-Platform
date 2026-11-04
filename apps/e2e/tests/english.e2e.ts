import { expect, type Page, test } from "@playwright/test";

import { insertAgentAnswer } from "../support/answers";
import { askQuestion, signIn } from "../support/journeys";

// #208: with the interface in English, the shared components of @codesphere/ui no longer show
// their French defaults. The Member signs in (in French, as the other journeys do), then
// switches the interface language through its cookie.
const FRENCH = [
	"Voter pour",
	"Voter contre",
	"Accepter",
	"Écrire",
	"Aperçu",
	"Votre réponse",
	"Publier la réponse",
	"Brouillon",
	"Confirmer",
	"Annuler",
	"Langue",
	"Pays",
	"autre réponse",
	"question proche",
];

async function toEnglish(page: Page, baseURL: string | undefined) {
	await page
		.context()
		.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL }]);
}

/** Every French default still visible or announced in `main`, to report them all at once. */
async function frenchLeft(page: Page) {
	const main = page.locator("main");
	const text = [
		await main.innerText(),
		...(await main
			.locator("[aria-label], [placeholder]")
			.evaluateAll((nodes) =>
				nodes.flatMap((n) => [
					n.getAttribute("aria-label") ?? "",
					n.getAttribute("placeholder") ?? "",
				]),
			)),
		...(await main.locator("label").allTextContents()),
	].join("\n");
	return FRENCH.filter((word) => text.includes(word));
}

test("the Question page speaks English, votes, answer form and deletion included", async ({
	page: author,
	browser,
	baseURL,
}) => {
	await signIn(author);
	const { path } = await askQuestion(author, "english");
	const body = "Agent answer for the English interface check.";
	await insertAgentAnswer(path.split("/").pop() ?? "", body);
	// The author's browser cached this page without the answer: read it from a fresh one.
	const page = await (await browser.newContext({ baseURL })).newPage();
	await signIn(page);
	await toEnglish(page, baseURL);
	await page.goto(path);

	// An Agent's answer no human has voted up yet stays folded (#244): open it.
	await page
		.locator("details > summary")
		.filter({ hasText: "agent" })
		.first()
		.click();
	const card = page.locator("article").filter({ hasText: body });
	await expect(card).toBeVisible();
	// One answer, none accepted: « 1 answer », not « 1 other answer ».
	await expect(page.getByRole("heading", { name: "1 answer" })).toBeVisible();
	await expect(card.getByRole("button", { name: "Upvote" })).toBeVisible();
	await expect(card.getByRole("button", { name: "Downvote" })).toBeVisible();
	await expect(card.getByRole("button", { name: "Accept" })).toBeVisible();

	await expect(page.getByRole("tab", { name: "Write" })).toBeVisible();
	await expect(page.getByRole("tab", { name: "Preview" })).toBeVisible();
	const answerBox = page.locator("#answer-body");
	await expect(answerBox).toHaveAccessibleName("Your answer in Markdown");
	await answerBox.fill("A draft kept on this device.");
	await expect(page.getByText("Draft saved on this device.")).toBeVisible();
	await expect(page.locator("#answer-submit")).toHaveText("Publish the answer");

	await page.getByRole("button", { name: "Delete the question…" }).click();
	await expect(page.getByRole("button", { name: /^Confirm \(/ })).toBeVisible();
	expect(await frenchLeft(page)).toEqual([]);
	await page.getByRole("button", { name: "Cancel" }).click();
	await expect(
		page.getByRole("button", { name: "Delete the question…" }),
	).toBeVisible();
	// Leaves no draft behind for the next run.
	await answerBox.fill("");
});

test("the feed filters and the similar questions of /ask speak English", async ({
	page,
	baseURL,
}) => {
	await signIn(page);
	await toEnglish(page, baseURL);

	await page.goto("/");
	await expect(page.locator("label", { hasText: "Language" })).toHaveCount(1);
	await expect(page.locator("label", { hasText: "Country" })).toHaveCount(1);

	await page.goto("/ask");
	// Close to the seeded « How do I deploy a Next.js app to Cloudflare Workers? ».
	await page
		.locator("#ask-title")
		.fill("How do I deploy a Next.js app to Cloudflare?");
	await expect(
		page.getByText("A similar question may already exist"),
	).toBeVisible();
	expect(await frenchLeft(page)).toEqual([]);
});
