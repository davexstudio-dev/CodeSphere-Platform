// Records the public scenes of the demo video on the real site (#358), with Playwright.
//   cd video && SCRATCH=<dir outside the repo> node scripts/record.mjs
// 1. opens a visible Chrome on /signin: sign in yourself (the profile stays in $SCRATCH/profile,
//    outside the repo, and holds your session: never commit it);
// 2. waits for the file $SCRATCH/ok to exist, then records each scene in a fresh page;
// 3. writes public/clips/<scene>.webm (convert with `npx remotion ffmpeg`, see the README).
// Nothing is ever published: the /ask scene stops at the review step.
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(resolve("../apps/e2e/package.json"));
const { chromium } = require("@playwright/test");

const BASE = process.env.BASE ?? "https://codesphereplatform.xyz";
const SCRATCH = process.env.SCRATCH;
if (!SCRATCH) {
	console.error("Set SCRATCH to a directory outside the repository.");
	process.exit(1);
}
const OK_FILE = resolve(SCRATCH, "ok");
const TMP = resolve(SCRATCH, "videos");
const OUT = resolve("public/clips");
const SIZE = { width: 1536, height: 864 };
const QUESTION = "ba3f5fb7";

mkdirSync(OUT, { recursive: true });
rmSync(TMP, { recursive: true, force: true });
rmSync(OK_FILE, { force: true });

const options = {
	headless: false,
	viewport: SIZE,
	locale: "fr-FR",
	recordVideo: { dir: TMP, size: SIZE },
	// Optional: a Chromium that is already installed (the one Playwright expects may be missing).
	...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
};
let context;
try {
	context = await chromium.launchPersistentContext(
		resolve(SCRATCH, "profile"),
		{
			...options,
			channel: "chrome",
		},
	);
} catch {
	context = await chromium.launchPersistentContext(
		resolve(SCRATCH, "profile"),
		options,
	);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function scroll(page, seconds, distance) {
	const steps = Math.round(seconds * 10);
	for (let i = 0; i < steps; i++) {
		await page.mouse.wheel(0, distance / steps);
		await sleep(100);
	}
}

async function questionUrl(page) {
	const response = await page.request.get(`${BASE}/api/v1/questions?limit=30`);
	const { items } = await response.json();
	const found = items.find((item) => item.id.startsWith(QUESTION));
	return `${BASE}/questions/${found ? found.id : items[0].id}`;
}

const scenes = {
	async problem(page) {
		await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
		await sleep(1500);
		await scroll(page, 11, 1400);
		await sleep(1500);
	},
	async topics(page) {
		await page.goto(await questionUrl(page), { waitUntil: "networkidle" });
		await sleep(2000);
		await scroll(page, 10, 900);
		await sleep(2000);
	},
	async ask(page) {
		await page.goto(`${BASE}/ask`, { waitUntil: "networkidle" });
		await sleep(1500);
		await page
			.getByLabel("Titre")
			.pressSequentially(
				"Comment vérifier un callback de paiement mobile money ?",
				{
					delay: 45,
				},
			);
		await sleep(600);
		await page.getByRole("button", { name: "Continuer" }).click();
		await sleep(800);
		await page
			.getByLabel("Détails")
			.pressSequentially(
				"Je reçois un callback de l'opérateur, mais je ne sais pas comment vérifier qu'il est authentique.\n\n```js\napp.post('/callback', verify, handler)\n```",
				{ delay: 25 },
			);
		await sleep(600);
		await page
			.getByRole("tab", { name: "Aperçu" })
			.click()
			.catch(() => {});
		await sleep(2500);
		await page.getByRole("button", { name: "Continuer" }).click();
		await sleep(800);
		await page
			.getByLabel("Tags")
			.pressSequentially("mobile-money", { delay: 60 });
		await page.keyboard.press("Enter");
		await sleep(1500);
		await page.getByRole("button", { name: "Continuer" }).click();
		await sleep(3500);
		// Stops here: the "Publier la question" button is never clicked.
	},
	async cadev(page) {
		await page.goto(`${BASE}/hackathons/cadev-2026`, {
			waitUntil: "networkidle",
		});
		await sleep(2500);
		for (const tab of ["Frise", "Jugement", "Discussion"]) {
			await page
				.getByRole("tab", { name: tab })
				.click()
				.catch(() => {});
			await sleep(3500);
		}
		await scroll(page, 4, 500);
	},
};

const login = await context.newPage();
await login.goto(`${BASE}/signin`);
console.log(`READY: sign in in the open window, then create ${OK_FILE}`);
while (!existsSync(OK_FILE)) {
	await sleep(1000);
}
await login.close();

for (const [id, run] of Object.entries(scenes)) {
	const page = await context.newPage();
	try {
		console.log(`recording ${id}`);
		await run(page);
	} catch (error) {
		console.error(`scene ${id} failed: ${error.message.split("\n")[0]}`);
	}
	const video = page.video();
	await page.close();
	if (video) {
		renameSync(await video.path(), resolve(OUT, `${id}.webm`));
		console.log(`saved public/clips/${id}.webm`);
	}
}
await context.close();
rmSync(TMP, { recursive: true, force: true });
console.log("DONE");
