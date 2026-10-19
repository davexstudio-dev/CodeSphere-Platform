import { expect, test } from "@playwright/test";
import { seedValidatedOrganization } from "../support/jobs";
import { signIn } from "../support/journeys";

// Job postings (#258): an Organization's owner publishes, a Member finds it by Tag and applies with
// their card, the owner sees the application; a posting asking for money is refused.
const run = Date.now().toString(36);
const TAG = `emploi${run}`;
const TITLE = `Développeuse API ${run}`;

test("publish, find, apply with the card, and see the applicant", async ({
	browser,
	baseURL,
}) => {
	const owner = await (await browser.newContext({ baseURL })).newPage();
	await signIn(owner, `job.owner.${run}@example.com`);
	await seedValidatedOrganization(
		`job.owner.${run}@example.com`,
		`jobs-org-${run}`,
		`Jobs Org ${run}`,
	);

	await owner.goto("/jobs/new");
	await owner.getByLabel("Titre du poste").fill(TITLE);
	await owner
		.getByLabel(/Description/)
		.fill("Nous cherchons une développeuse pour construire des API robustes.");
	await owner.getByLabel(/Tags, séparés/).fill(`${TAG}, sql`);
	await owner.getByLabel("Pays", { exact: true }).fill("SN");
	await owner
		.getByLabel("Lien de candidature")
		.fill("https://e2e-jobs.example.org/apply");

	// An ask for money is refused with its reason.
	await owner
		.getByLabel(/Description/)
		.fill(
			"Poste ouvert. Des frais de dossier de 10 000 FCFA sont à régler avant l'entretien.",
		);
	await owner.getByRole("button", { name: "Publier pour 30 jours" }).click();
	await expect(owner.getByText(/jamais de demande d'argent/)).toBeVisible();

	await owner
		.getByLabel(/Description/)
		.fill("Nous cherchons une développeuse pour construire des API robustes.");
	await owner.getByRole("button", { name: "Publier pour 30 jours" }).click();
	await expect(owner).toHaveURL(/\/jobs\/[0-9a-f-]{36}$/);
	await expect(owner.getByRole("heading", { name: TITLE })).toBeVisible();

	const candidate = await (await browser.newContext({ baseURL })).newPage();
	await signIn(candidate, `job.cand.${run}@example.com`);
	await candidate.goto("/jobs");
	await candidate.getByLabel("Tag", { exact: true }).fill(TAG);
	const card = candidate.getByRole("article").filter({ hasText: TITLE });
	await expect(card).toBeVisible();
	await card.getByRole("link", { name: TITLE }).click();
	await expect(candidate.getByText("Postuler est gratuit")).toBeVisible();
	await candidate
		.getByRole("button", { name: "Postuler avec ma fiche CodeSphere" })
		.click();
	await expect(
		candidate.getByText(
			"Vous avez postulé en partageant votre fiche CodeSphere.",
		),
	).toBeVisible();

	await owner.reload();
	await expect(
		owner.getByRole("heading", { name: "Candidatures reçues" }),
	).toBeVisible();
	await expect(
		owner
			.getByText(`job.cand.${run}`.split("@")[0] ?? "", { exact: false })
			.first(),
	).toBeVisible();
});

test("the Talent card is off by default and can be turned on", async ({
	page,
}) => {
	await signIn(page, `job.talent.${run}@example.com`);
	await page.goto("/settings");
	const enabled = page.getByRole("switch", { name: "Activer ma fiche talent" });
	await expect(enabled).toBeEnabled();
	await expect(enabled).not.toBeChecked();
	await enabled.click();
	await expect(enabled).toBeChecked();
	const contact = page.getByRole("switch", { name: "Ouvert aux contacts" });
	await expect(contact).toBeEnabled();
});
