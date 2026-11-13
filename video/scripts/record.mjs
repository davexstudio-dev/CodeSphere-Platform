// Records the public scenes of the demo video on the real site (#358), with Playwright.
//   cd video && SCRATCH=<dir outside the repo> node scripts/record.mjs
// 1. opens a visible Chrome on /signin: sign in yourself (the profile stays in $SCRATCH/profile,
//    outside the repo, and holds your session: never commit it);
// 2. waits for the file $SCRATCH/ok to exist, then records each scene in a fresh page;
// 3. writes public/clips/<scene>.webm (convert with `npx remotion ffmpeg`, see the README).
// Nothing is ever published: the /ask scene stops at the review step.
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
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
// VIEWPORT=540x960 CLIP_PREFIX=cut- records the vertical clips of the 9:16 cut (540x960, enlarged to
// 1080x1920 with ffmpeg: Playwright records at the viewport size and does not upscale).
const [VIEW_W, VIEW_H] = (process.env.VIEWPORT ?? "1536x864")
	.split("x")
	.map(Number);
const SCALE = Number(process.env.DSF ?? 1);
const PREFIX = process.env.CLIP_PREFIX ?? "";
const SIZE = { width: VIEW_W, height: VIEW_H };
const QUESTION = "ba3f5fb7";

mkdirSync(OUT, { recursive: true });
rmSync(TMP, { recursive: true, force: true });
rmSync(OK_FILE, { force: true });

const options = {
	headless: false,
	viewport: SIZE,
	locale: "fr-FR",
	deviceScaleFactor: SCALE,
	recordVideo: {
		dir: TMP,
		size: { width: VIEW_W * SCALE, height: VIEW_H * SCALE },
	},
	// Optional: a Chromium that is already installed (the one Playwright expects may be missing).
	...(process.env.CHROME_PATH
		? { executablePath: process.env.CHROME_PATH }
		: {}),
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
		// A previous take leaves a Draft on the device (idb-keyval): drop it, or the new text is
		// appended to the old one. Then reload so the form starts empty.
		await page.evaluate(
			() =>
				new Promise((done) => {
					const open = indexedDB.open("keyval-store");
					open.onerror = () => done();
					open.onsuccess = () => {
						const tx = open.result.transaction("keyval", "readwrite");
						const store = tx.objectStore("keyval");
						store.openCursor().onsuccess = (event) => {
							const cursor = event.target.result;
							if (!cursor) return;
							if (String(cursor.key).endsWith(":draft:question:new"))
								cursor.delete();
							cursor.continue();
						};
						tx.oncomplete = () => done();
						tx.onerror = () => done();
					};
				}),
		);
		await page.reload({ waitUntil: "networkidle" });
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
		// The preview is loaded on demand: wait until it has rendered before filming it.
		await page
			.getByText("Préparation de l'aperçu")
			.waitFor({ state: "hidden", timeout: 20000 })
			.catch(() => {});
		await sleep(3500);
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
	// The network cut is real (CDP offline), the answer is really sent when it comes back. The scene
	// returns a cleanup that deletes that test answer, run on a page that is not part of the clip.
	async offline(page) {
		await page.goto(await questionUrl(page), { waitUntil: "networkidle" });
		await sleep(1500);
		// On a narrow page the answers and the form are under the "Réponses" tab.
		await page
			.getByRole("tab", { name: /Réponses/ })
			.first()
			.click({ timeout: 3000 })
			.catch(() => {});
		await sleep(800);
		const body = page.getByLabel("Votre réponse en Markdown");
		await body.scrollIntoViewIfNeeded();
		// Leave room under the form for the button and the "pending" message.
		await page.mouse.wheel(0, 350);
		await sleep(1000);
		await body.pressSequentially(
			"Vérifie la signature du callback avec le secret partagé, puis traite l'appel de façon idempotente.",
			{ delay: 40 },
		);
		await sleep(1500);
		await context.setOffline(true);
		await sleep(2000);
		await page.getByRole("button", { name: "Publier la réponse" }).click();
		await sleep(5000);
		await context.setOffline(false);
		await page
			.getByText("En attente d'envoi")
			.waitFor({ state: "hidden", timeout: 30000 })
			.catch(() => {});
		// The answer is really published once its delete button shows (it can take a while on a phone).
		await page
			.getByRole("button", { name: "Supprimer ma réponse" })
			.first()
			.waitFor({ timeout: 40000 })
			.catch(() => {});
		await sleep(4000);
		const url = page.url();
		return async () => {
			const cleanup = await context.newPage();
			await cleanup.goto(url, { waitUntil: "networkidle" });
			// On a narrow page the answers are under the "Réponses" tab.
			await cleanup
				.getByRole("tab", { name: /Réponses/ })
				.first()
				.click({ timeout: 3000 })
				.catch(() => {});
			await sleep(800);
			await cleanup
				.getByRole("button", { name: "Supprimer ma réponse" })
				.first()
				.click();
			await cleanup.getByRole("button", { name: /^Confirmer/ }).click();
			await sleep(2500);
			await cleanup.close();
		};
	},
	// The feed a Member lands on after signing in (used to end the "signin" plan: staff accounts
	// land on /admin after the sign-in, so this is filmed separately, already signed in).
	async feed(page) {
		await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
		await sleep(1500);
		await page
			.getByRole("tab", { name: "Pour toi" })
			.click()
			.catch(() => {});
		await sleep(2500);
		await scroll(page, 5, 700);
		await sleep(1500);
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

// SCENES=ask,cadev records only those scenes (default: all).
const only = process.env.SCENES?.split(",");
for (const [id, run] of Object.entries(scenes)) {
	if (only && !only.includes(id)) continue;
	const page = await context.newPage();
	let cleanup;
	try {
		console.log(`recording ${id}`);
		cleanup = await run(page);
	} catch (error) {
		console.error(`scene ${id} failed: ${error.message.split("\n")[0]}`);
	}
	const video = page.video();
	await page.close();
	if (video) {
		// Copy, not rename: the scratch directory can be on another drive than the repository.
		copyFileSync(await video.path(), resolve(OUT, `${PREFIX}${id}.webm`));
		console.log(`saved public/clips/${id}.webm`);
	}
	if (cleanup) {
		await cleanup().catch((error) =>
			console.error(`cleanup of ${id} failed: ${error.message.split("\n")[0]}`),
		);
	}
}
await context.close();
rmSync(TMP, { recursive: true, force: true });
console.log("DONE");
