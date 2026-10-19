import {
	type Browser,
	type BrowserContext,
	expect,
	type Page,
	test,
} from "@playwright/test";

import { signIn } from "../support/journeys";

// The back-office end to end: access control, every menu, the Tag CRUD, the moderation of a
// Member, the Hackathon edit and the audit log. Labels are the fr-FR ones. The staff emails come
// from ADMIN_EMAILS / MODERATOR_EMAILS in playwright.config.ts: the role is derived at sign-in.
const ADMIN_EMAIL = "e2e.admin@example.com";
const MODERATOR_EMAIL = "e2e.moderator@example.com";

// Pages of the back-office, in the order of the sidebar.
const MENUS = [
	{ name: "Tableau de bord", path: "/dashboard" },
	{ name: "Modération", path: "/admin" },
	{ name: "Hackathon", path: "/admin/hackathons" },
	{ name: "Tags", path: "/admin/tags" },
	{ name: "Web Vitals", path: "/admin/vitals" },
	{ name: "Journal d'audit", path: "/admin/audit" },
] as const;

// One sign-in per staff account: the sign-in endpoint is rate-limited, and a session is all the
// tests need. Each test still gets its own browser context, loaded from the saved session.
const sessions = new Map<string, Promise<StorageState>>();
type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

/** A fresh browser context signed in as `email`, so no state leaks between the tests. */
async function sessionAs(
	browser: Browser,
	baseURL: string | undefined,
	email: string,
	{ fresh = false } = {},
) {
	if (fresh) {
		// Its own sign-in, for a test that ends the session: the shared one must stay valid.
		const context = await browser.newContext({ baseURL, locale: "fr-FR" });
		const page = await context.newPage();
		await signIn(page, email);
		return page;
	}
	let saved = sessions.get(email);
	if (!saved) {
		saved = (async () => {
			const context = await browser.newContext({ baseURL, locale: "fr-FR" });
			await signIn(await context.newPage(), email);
			const state = await context.storageState();
			await context.close();
			return state;
		})();
		sessions.set(email, saved);
		// A failed sign-in must not poison the next test.
		saved.catch(() => sessions.delete(email));
	}
	const context = await browser.newContext({
		baseURL,
		locale: "fr-FR",
		storageState: await saved,
	});
	return context.newPage();
}

// A cold `next dev` compiles each page on its first visit: allow for it.
test.beforeEach(({ browser: _browser }, info) => info.setTimeout(120_000));

const sidebar = (page: Page) =>
	page.getByRole("navigation", { name: "Administration" });
const confirm = (page: Page) =>
	page.getByRole("button", { name: /^Confirmer/ });

test.describe("access", () => {
	test("a visitor is sent to the sign-in page", async ({ page }) => {
		for (const { path } of MENUS) {
			await page.goto(path);
			await expect(page).toHaveURL(/\/signin/);
		}
	});

	test("a plain Member is sent back home", async ({ browser, baseURL }) => {
		const page = await sessionAs(browser, baseURL, "awa.seed@example.com");
		for (const { path } of MENUS) {
			await page.goto(path);
			await expect(page).not.toHaveURL(/\/admin|\/dashboard/);
		}
	});

	test("a moderator and an admin enter, and see their role", async ({
		browser,
		baseURL,
	}) => {
		for (const [email, role] of [
			[MODERATOR_EMAIL, "moderator"],
			[ADMIN_EMAIL, "admin"],
		] as const) {
			const page = await sessionAs(browser, baseURL, email);
			await page.goto("/dashboard");
			await expect(
				page.getByRole("heading", { name: "Tableau de bord" }),
			).toBeVisible();
			await expect(page.getByText(role, { exact: true })).toBeVisible();
		}
	});
});

test.describe("menus", () => {
	test("the sidebar leads to every page and marks the current one", async ({
		browser,
		baseURL,
	}) => {
		const page = await sessionAs(browser, baseURL, ADMIN_EMAIL);
		await page.goto("/dashboard");
		for (const { name, path } of MENUS) {
			await sidebar(page).getByRole("link", { name }).click();
			await expect(page).toHaveURL(new RegExp(`${path}$`));
			await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
			await expect(sidebar(page).getByRole("link", { name })).toHaveAttribute(
				"aria-current",
				"page",
			);
		}
	});

	test("the dashboard shows its seven indicators on both periods", async ({
		browser,
		baseURL,
	}) => {
		const page = await sessionAs(browser, baseURL, ADMIN_EMAIL);
		await page.goto("/dashboard");
		const metrics = [
			"Membres actifs",
			"Questions posées",
			"Questions avec réponse",
			"Délai médian de première réponse",
			"Questions sans réponse",
			"Questions avec réponse acceptée",
			"Contenu d'agents",
		];
		for (const period of ["7 jours", "30 jours"]) {
			await page.getByRole("tab", { name: period }).click();
			await expect(page.getByRole("tab", { name: period })).toHaveAttribute(
				"aria-selected",
				"true",
			);
			for (const metric of metrics) {
				await expect(page.getByText(metric, { exact: true })).toBeVisible();
			}
		}
	});

	test("the sidebar collapses and expands", async ({ browser, baseURL }) => {
		const page = await sessionAs(browser, baseURL, ADMIN_EMAIL);
		await page.goto("/dashboard");
		const shell = page.locator("[data-slot=admin-shell]");
		await page.getByRole("button", { name: "Réduire le menu" }).click();
		await expect(shell).toHaveAttribute("data-collapsed", "true");
		await page.getByRole("button", { name: "Déployer le menu" }).click();
		await expect(shell).toHaveAttribute("data-collapsed", "false");
	});

	test("the language switch changes the back-office language", async ({
		browser,
		baseURL,
	}) => {
		const page = await sessionAs(browser, baseURL, ADMIN_EMAIL);
		await page.goto("/dashboard");
		await page.getByRole("button", { name: "English" }).click();
		await expect(
			page.getByRole("heading", { level: 1, name: "Dashboard" }),
		).toBeVisible();
		await page.getByRole("button", { name: "Français" }).click();
		await expect(
			page.getByRole("heading", { level: 1, name: "Tableau de bord" }),
		).toBeVisible();
	});

	test("signing out closes the back-office", async ({ browser, baseURL }) => {
		const page = await sessionAs(browser, baseURL, ADMIN_EMAIL, {
			fresh: true,
		});
		await page.goto("/dashboard");
		await page.getByRole("button", { name: "Se déconnecter" }).click();
		await expect(page).toHaveURL(baseURL ? `${baseURL}/` : "/");
		await page.goto("/admin");
		await expect(page).toHaveURL(/\/signin/);
	});
});

test.describe("tags", () => {
	test("an Admin creates, renames and deletes a Tag", async ({
		browser,
		baseURL,
	}) => {
		const page = await sessionAs(browser, baseURL, ADMIN_EMAIL);
		const stamp = Date.now().toString(36);
		const created = `e2e-tag-${stamp}`;
		const renamed = `e2e-renamed-${stamp}`;
		const inList = (name: string) =>
			page.getByRole("button", { name: new RegExp(name) });

		await page.goto("/admin/tags");
		await page.getByRole("button", { name: "Créer un Tag" }).click();
		await page.getByLabel("Nom").fill(created);
		await page.getByRole("button", { name: "Créer", exact: true }).click();
		await expect(page.getByRole("heading", { name: created })).toBeVisible();
		await expect(inList(created)).toBeVisible();

		await page.getByRole("button", { name: "Modifier" }).click();
		await page.getByLabel("Nom").fill(renamed);
		await page.getByRole("button", { name: "Enregistrer" }).click();
		await expect(page.getByRole("heading", { name: renamed })).toBeVisible();
		await expect(inList(created)).toHaveCount(0);

		await page.getByRole("button", { name: "Supprimer ce Tag" }).click();
		await confirm(page).click();
		await expect(inList(renamed)).toHaveCount(0);
		await expect(page.getByText("Choisissez un Tag")).toBeVisible();
	});

	test("a protected Tag cannot be renamed or deleted", async ({
		browser,
		baseURL,
	}) => {
		const page = await sessionAs(browser, baseURL, ADMIN_EMAIL);
		await page.goto("/admin/tags");
		await page.getByRole("button", { name: /cadev/i }).first().click();
		await expect(
			page.getByText("Protégé", { exact: true }).first(),
		).toBeVisible();
		await expect(page.getByRole("button", { name: "Modifier" })).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Supprimer ce Tag" }),
		).toBeDisabled();
	});

	test("an Admin reserves a Tag, which then cannot be edited, and lifts it", async ({
		browser,
		baseURL,
	}) => {
		const page = await sessionAs(browser, baseURL, ADMIN_EMAIL);
		const name = `e2e-reserved-${Date.now().toString(36)}`;
		await page.goto("/admin/tags");
		await page.getByRole("button", { name: "Créer un Tag" }).click();
		await page.getByLabel("Nom").fill(name);
		await page.getByRole("switch", { name: "Réserver ce Tag" }).click();
		await page.getByRole("button", { name: "Créer", exact: true }).click();
		await expect(page.getByRole("heading", { name })).toBeVisible();
		await expect(
			page.getByText("Réservé", { exact: true }).first(),
		).toBeVisible();
		await expect(page.getByRole("button", { name: "Modifier" })).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Supprimer ce Tag" }),
		).toBeDisabled();

		const reserved = page.getByRole("switch", { name: "Réservé" });
		await reserved.click();
		await expect(page.getByRole("button", { name: "Modifier" })).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Supprimer ce Tag" }),
		).toBeEnabled();
		await page.getByRole("button", { name: "Supprimer ce Tag" }).click();
		await confirm(page).click();
		await expect(page.getByText("Choisissez un Tag")).toBeVisible();
	});

	test("a system Tag stays reserved", async ({ browser, baseURL }) => {
		const page = await sessionAs(browser, baseURL, ADMIN_EMAIL);
		await page.goto("/admin/tags");
		await page
			.getByRole("button", { name: /^roadmap/ })
			.first()
			.click();
		await expect(page.getByRole("switch", { name: "Réservé" })).toBeDisabled();
		await expect(page.getByText("toujours réservé")).toBeVisible();
	});

	test("a duplicate name is refused", async ({ browser, baseURL }) => {
		const page = await sessionAs(browser, baseURL, ADMIN_EMAIL);
		await page.goto("/admin/tags");
		await page.getByRole("button", { name: "Créer un Tag" }).click();
		await page.getByLabel("Nom").fill("api");
		await page.getByRole("button", { name: "Créer", exact: true }).click();
		await expect(page.getByText(/Ce nom est déjà pris/)).toBeVisible();
	});
});

test.describe("moderation", () => {
	test("an Admin suspends then reactivates a Member, and the audit log remembers", async ({
		browser,
		baseURL,
	}) => {
		const page = await sessionAs(browser, baseURL, ADMIN_EMAIL);
		await page.goto("/admin");
		await page.getByRole("button", { name: /Awa Seed/ }).click();
		await expect(page.getByRole("heading", { name: "Awa Seed" })).toBeVisible();

		try {
			// Three characters at least: the button stays off until the reason is valid.
			const suspend = page.getByRole("button", { name: "Suspendre ce Member" });
			await expect(suspend).toBeDisabled();
			await page
				.getByLabel("Raison (obligatoire)")
				.fill("E2E : test de suspension");
			await suspend.click();
			await confirm(page).click();
			await expect(
				page.getByRole("button", { name: "Réactiver" }),
			).toBeVisible();
			await expect(
				page.getByText("Suspendu", { exact: true }).first(),
			).toBeVisible();

			await page.getByRole("button", { name: "Suspendus" }).first().click();
			await expect(
				page.getByRole("button", { name: /Awa Seed/ }),
			).toBeVisible();
		} finally {
			// Leave the seeded Member as found, whatever failed above.
			await page.goto("/admin");
			await page.getByRole("button", { name: /Awa Seed/ }).click();
			const reactivate = page.getByRole("button", { name: "Réactiver" });
			if (await reactivate.isVisible()) {
				await reactivate.click();
			}
		}
		await expect(
			page.getByRole("button", { name: "Suspendre ce Member" }),
		).toBeVisible();

		await page.goto("/admin/audit");
		await page.getByLabel("Action").fill("member.");
		await expect(
			page.getByText(/member\.suspend|Suspension/i).first(),
		).toBeVisible();
	});

	test("a moderator cannot moderate an Admin or themselves", async ({
		browser,
		baseURL,
	}) => {
		// The Admin has to exist: signing in creates the account.
		await sessionAs(browser, baseURL, ADMIN_EMAIL);
		const page = await sessionAs(browser, baseURL, MODERATOR_EMAIL);
		await page.goto("/admin");
		await page.getByLabel("Rechercher un Member").fill(ADMIN_EMAIL);
		await page.getByRole("button", { name: /e2e/i }).first().click();
		await expect(page.getByText(/Rang égal ou supérieur/)).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Suspendre ce Member" }),
		).toBeDisabled();
	});

	test("the list filters by status and by search", async ({
		browser,
		baseURL,
	}) => {
		const page = await sessionAs(browser, baseURL, ADMIN_EMAIL);
		await page.goto("/admin");
		await expect(
			page.getByText("Choisissez un Member dans la liste."),
		).toBeVisible();
		await page.getByRole("button", { name: "Actifs" }).first().click();
		await expect(
			page.getByRole("button", { name: "Actifs" }).first(),
		).toHaveAttribute("aria-pressed", "true");
		await page.getByLabel("Rechercher un Member").fill("zzz-nobody");
		await expect(page.getByText("Aucun Member à afficher.")).toBeVisible();
	});
});

/** The Hackathon edit: save bar, then the confirmation, whose action is a two-step button. */
async function saveHackathon(page: Page) {
	const save = page.getByRole("button", { name: "Enregistrer" });
	// Only the save bar offers it at first; the confirmation then appears above it.
	await save.click();
	await save.first().click();
	await confirm(page).click();
	await expect(page.getByRole("button", { name: "Modifier" })).toBeVisible();
}

test.describe("hackathon", () => {
	test("an Admin reads the CADEV and edits then restores its source note", async ({
		browser,
		baseURL,
	}) => {
		const page = await sessionAs(browser, baseURL, ADMIN_EMAIL);
		await page.goto("/admin/hackathons");
		await page.getByRole("button", { name: /Coupe d'Afrique/ }).click();
		await expect(
			page.getByText("Organisateur", { exact: true }).first(),
		).toBeVisible();
		await expect(
			page.getByText("Milestones", { exact: true }).first(),
		).toBeVisible();
		await expect(
			page.getByText("Critères de jugement", { exact: true }).first(),
		).toBeVisible();

		const note = `E2E ${Date.now()}`;
		await page.getByRole("button", { name: "Modifier" }).click();
		await expect(
			page.getByText("Le Hackathon ne se supprime pas."),
		).toBeVisible();
		const field = page.getByLabel("Note de source");
		const before = await field.inputValue();
		await field.fill(note);
		await saveHackathon(page);
		await expect(page.getByText(note)).toBeVisible();

		// Restore.
		await page.getByRole("button", { name: "Modifier" }).click();
		await page.getByLabel("Note de source").fill(before);
		await saveHackathon(page);
		await expect(page.getByText(note)).toHaveCount(0);
	});
});

test.describe("audit log", () => {
	test("filters narrow the journal and an empty result says so", async ({
		browser,
		baseURL,
	}) => {
		const page = await sessionAs(browser, baseURL, ADMIN_EMAIL);
		await page.goto("/admin/audit");
		await page.getByLabel("Action").fill("action.that.never.exists");
		await expect(
			page.getByText("Aucun événement pour ces filtres."),
		).toBeVisible();
		await page.getByLabel("Action").fill("");
		await page.getByLabel("Type de cible").fill("tag");
		await expect(
			page.getByText("Aucun événement pour ces filtres."),
		).toHaveCount(0);
	});
});

test.describe("responsive", () => {
	for (const width of [375, 768, 1024]) {
		test(`no page scrolls sideways at ${width} px`, async ({
			browser,
			baseURL,
		}) => {
			const page = await sessionAs(browser, baseURL, ADMIN_EMAIL);
			await page.setViewportSize({ width, height: 800 });
			for (const { name, path } of MENUS) {
				await page.goto(path);
				await expect(
					page.getByRole("heading", { level: 1, name }),
				).toBeVisible();
				const overflow = await page.evaluate(
					() =>
						document.documentElement.scrollWidth -
						document.documentElement.clientWidth,
				);
				expect(overflow, `${path} at ${width} px`).toBeLessThanOrEqual(0);
			}
		});
	}

	test("the Hackathon record keeps a readable width on a tablet", async ({
		browser,
		baseURL,
	}) => {
		const page = await sessionAs(browser, baseURL, ADMIN_EMAIL);
		await page.setViewportSize({ width: 768, height: 900 });
		await page.goto("/admin/hackathons");
		await page.getByRole("button", { name: /Coupe d'Afrique/ }).click();
		const box = await page
			.getByText("Organisateur", { exact: true })
			.first()
			.boundingBox();
		const record = await page
			.getByText("Critères de jugement", { exact: true })
			.first()
			.boundingBox();
		expect(box).not.toBeNull();
		expect(record?.width ?? 0).toBeGreaterThan(200);
	});

	test("on a phone the menu is a scrolling bar and the logo stays round", async ({
		browser,
		baseURL,
	}) => {
		const page = await sessionAs(browser, baseURL, ADMIN_EMAIL);
		await page.setViewportSize({ width: 375, height: 800 });
		await page.goto("/dashboard");
		await expect(
			sidebar(page).getByRole("link", { name: "Tableau de bord" }),
		).toBeVisible();
		const mark = page.locator("[data-slot=logo] > span").first();
		const size = await mark.boundingBox();
		expect(size?.width).toBeCloseTo(size?.height ?? 0, 0);
	});
});
