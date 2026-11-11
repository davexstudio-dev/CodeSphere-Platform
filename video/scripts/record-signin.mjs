// Records the "signin" plan of the demo video on the staging (#358): sign-in with a one-time code sent by email.
//   cd video && SCRATCH=<dir outside the repo, with the profile of record.mjs> EMAIL=<address> node scripts/record-signin.mjs
//
// 1. the profile must be signed out (use the account menu → « Se déconnecter » first);
// 2. the script ticks the consent box, types EMAIL and asks for a code;
// 3. it then waits for the file $SCRATCH/code to exist (put the 6 digits received by email in it);
//    the wait is cut from the clip, which keeps the typing of the address, the sending, and the typing
//    of the code;
// 4. writes public/clips/signin.mp4 (1920x1080, no sound).
// Note: the address typed is visible on screen. Use an address you accept to show, or blur it when editing.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(resolve("../apps/e2e/package.json"));
const { chromium } = require("@playwright/test");

const BASE = process.env.BASE ?? "https://staging.codesphereplatform.xyz";
const SCRATCH = process.env.SCRATCH;
const EMAIL = process.env.EMAIL;
if (!SCRATCH || !EMAIL) {
	console.error("Set SCRATCH (directory of record.mjs) and EMAIL.");
	process.exit(1);
}
const PROFILE = resolve(SCRATCH, "profile");
const TMP = resolve(SCRATCH, `videos-signin-${Date.now()}`);
const CODE_FILE = resolve(SCRATCH, "code");
const OUT = resolve("public/clips");
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const SIZE = { width: 1536, height: 864 };
mkdirSync(OUT, { recursive: true });
rmSync(CODE_FILE, { force: true });

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const options = {
	headless: true,
	locale: "fr-FR",
	viewport: SIZE,
	recordVideo: { dir: TMP, size: SIZE },
};
let context;
try {
	context = await chromium.launchPersistentContext(PROFILE, { ...options, channel: "chrome" });
} catch {
	context = await chromium.launchPersistentContext(PROFILE, options);
}

let sentAt;
let codeAt;
let videoPath;
try {
	const page = await context.newPage();
	const t0 = Date.now();
	const seconds = () => (Date.now() - t0) / 1000;
	await page.goto(`${BASE}/signin`, { waitUntil: "networkidle" });
	if (!page.url().includes("/signin")) {
		throw new Error("the profile is still signed in: sign out first");
	}
	await sleep(2000);
	await page.getByRole("checkbox").first().check();
	await sleep(1000);
	await page.getByLabel("Ou avec un code par email").pressSequentially(EMAIL, { delay: 55 });
	await sleep(1200);
	await page.getByRole("button", { name: "Envoyer le code" }).click();
	await page.getByLabel("Code reçu par email").waitFor({ timeout: 30000 });
	await sleep(1500);
	sentAt = seconds();
	console.log(`CODE_SENT: put the 6 digits in ${CODE_FILE}`);
	while (!existsSync(CODE_FILE)) {
		await sleep(1000);
		if (seconds() - sentAt > 600) throw new Error("no code after 10 minutes");
	}
	const code = readFileSync(CODE_FILE, "utf8").trim();
	rmSync(CODE_FILE, { force: true });
	codeAt = seconds();
	await sleep(800);
	await page.getByLabel("Code reçu par email").pressSequentially(code, { delay: 120 });
	await sleep(800);
	await page.getByRole("button", { name: "Valider le code" }).click();
	await page
		.waitForURL((url) => !url.pathname.startsWith("/signin"), { timeout: 30000 })
		.catch(async (error) => {
			const alert = await page.getByRole("alert").allInnerTexts().catch(() => []);
			await page.screenshot({ path: resolve(SCRATCH, "debug-signin.png") }).catch(() => {});
			throw new Error(`still on /signin after the code (${alert.join(" ").slice(0, 160) || "no alert shown"})`);
		});
	await page.waitForLoadState("networkidle").catch(() => {});
	await sleep(5000);
	const video = page.video();
	await page.close();
	videoPath = await video.path();
} catch (error) {
	console.error(`failed: ${String(error.message).split("\n")[0]}`);
	process.exitCode = 1;
} finally {
	await context.close().catch(() => {});
}

if (videoPath && !process.exitCode) {
	// Cut the wait for the email: keep [0, sentAt] and [codeAt, end].
	const first = resolve(TMP, "part1.mp4");
	const second = resolve(TMP, "part2.mp4");
	const list = resolve(TMP, "list.txt");
	const encode = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30", "-an", "-vf", "scale=1920:1080"];
	execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", videoPath, "-t", String(sentAt), ...encode, first], { stdio: "inherit" });
	execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-ss", String(codeAt), "-i", videoPath, ...encode, second], { stdio: "inherit" });
	writeFileSync(list, `file '${first.replace(/\\/g, "/")}'\nfile '${second.replace(/\\/g, "/")}'\n`);
	execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", resolve(OUT, "signin.mp4")], { stdio: "inherit" });
	console.log("saved public/clips/signin.mp4");
	rmSync(TMP, { recursive: true, force: true });
}
console.log("DONE");
