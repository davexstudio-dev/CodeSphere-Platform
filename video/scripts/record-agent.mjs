// Records the "agent" and "badge" plans of the demo video on the staging (#358).
//   cd video && SCRATCH=<dir outside the repo, with the signed-in profile of record.mjs> node scripts/record-agent.mjs
//
// What it does, in order:
// 1. regenerates the key of the signed-in Member's demo Agent in Settings → Agents. THE PREVIOUS KEY STOPS
//    WORKING. The new key stays in this process: never printed, never written to a file, never on screen;
// 2. publishes a demo Question as that Member (it is deleted at the end, even if a step fails);
// 3. "agent": left, a terminal page that shows the REAL calls made to /mcp with that key (questions_list,
//    questions_get, answers_create); right, the Question page, reloaded when the answer exists.
//    The left side is an HTML replica of a terminal, driven by a script: it is NOT a language model at work.
//    Replace it with a real recording (OBS) if you want the real thing;
// 4. "badge": the Member accepts the Agent's answer;
// 5. writes public/clips/agent.mp4 and public/clips/badge.mp4 (1920x1080, no sound).
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(resolve("../apps/e2e/package.json"));
const { chromium } = require("@playwright/test");

const BASE = process.env.BASE ?? "https://staging.codesphereplatform.xyz";
const SCRATCH = process.env.SCRATCH;
if (!SCRATCH) {
	console.error(
		"Set SCRATCH to the directory of record.mjs (it holds the profile).",
	);
	process.exit(1);
}
const PROFILE = resolve(SCRATCH, "profile");
const TMP = resolve(SCRATCH, `videos-agent-${Date.now()}`);
const OUT = resolve("public/clips");
mkdirSync(OUT, { recursive: true });

const opened = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const TITLE = "Comment vérifier un callback de paiement mobile money ?";
const DETAILS =
	"Je reçois un callback de l'opérateur, mais je ne sais pas comment vérifier qu'il est authentique.";
const ANSWER =
	"Vérifie la signature du callback avec le secret partagé de l'opérateur, puis traite l'appel de façon idempotente : le rejouer ne doit pas créer de doublon.";

async function launchProfile(options) {
	const base = { headless: true, locale: "fr-FR", ...options };
	let context;
	try {
		context = await chromium.launchPersistentContext(PROFILE, {
			...base,
			channel: "chrome",
		});
	} catch {
		context = await chromium.launchPersistentContext(PROFILE, base);
	}
	opened.push(context);
	return context;
}

// ---- 1. regenerate the key (kept in memory only) and 2. publish the demo Question ----
let key;
let questionUrl;

async function prepare() {
	const context = await launchProfile({
		viewport: { width: 1536, height: 864 },
	});
	const page = await context.newPage();
	await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
	await page.getByText("Agents", { exact: true }).first().click();
	await sleep(1500);
	await page.getByRole("button", { name: "Régénérer la clé" }).click();
	for (let i = 0; i < 30 && !key; i++) {
		await sleep(500);
		key = (await page.content()).match(/cs_live_[A-Za-z0-9_-]{30,}/)?.[0];
	}
	if (!key) throw new Error("the new key was not found on the page");

	await page.goto(`${BASE}/ask`, { waitUntil: "networkidle" });
	// A Draft left by an earlier take would be restored: drop it, then reload.
	await page.evaluate(
		() =>
			new Promise((done) => {
				const open = indexedDB.open("keyval-store");
				open.onerror = () => done();
				open.onsuccess = () => {
					const tx = open.result.transaction("keyval", "readwrite");
					tx.objectStore("keyval").openCursor().onsuccess = (event) => {
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
	await page.getByLabel("Titre").fill(TITLE);
	await page.getByRole("button", { name: "Continuer" }).click();
	await page.getByLabel("Détails").fill(DETAILS);
	await page.getByRole("button", { name: "Continuer" }).click();
	await page
		.getByLabel("Tags")
		.pressSequentially("mobile-money", { delay: 30 });
	await page.keyboard.press("Enter");
	await page.getByRole("button", { name: "Continuer" }).click();
	await page.getByRole("button", { name: "Publier la question" }).click();
	await page.waitForURL(/\/questions\/[0-9a-f-]{36}/, { timeout: 30000 });
	questionUrl = page.url();
	await context.close();
}

async function removeQuestion() {
	if (!questionUrl) return;
	const context = await launchProfile({
		viewport: { width: 1536, height: 864 },
	});
	try {
		const page = await context.newPage();
		await page.goto(questionUrl, { waitUntil: "networkidle" });
		await page.getByRole("button", { name: "Supprimer la question" }).click();
		await page.getByRole("button", { name: /^Confirmer/ }).click();
		await sleep(3000);
		const gone = await fetch(
			`${BASE}/api/v1/questions/${questionUrl.split("/").pop()}`,
		);
		console.log(
			gone.status === 404
				? "demo Question deleted"
				: `demo Question: status ${gone.status} after delete`,
		);
	} finally {
		await context.close();
	}
}

// The web app keeps its reads 60 s and persists them in IndexedDB: a reload right after the Agent
// answered would show the old list. In a real demo the page has been open for longer; here the
// persisted Query cache is dropped before the reload.
async function dropQueryCache(page) {
	await page.evaluate(
		() =>
			new Promise((done) => {
				const open = indexedDB.open("keyval-store");
				open.onerror = () => done();
				open.onsuccess = () => {
					const tx = open.result.transaction("keyval", "readwrite");
					tx.objectStore("keyval").delete("codesphere:query-cache");
					tx.oncomplete = () => done();
					tx.onerror = () => done();
				};
			}),
	);
}

// On a narrow page the Question page has tabs: the answers are in "Réponses".
async function openAnswersTab(page) {
	const tab = page
		.getByRole("tab", { name: /Réponses/ })
		.or(page.getByRole("link", { name: /Réponses/ }))
		.or(page.getByRole("button", { name: /Réponses \(/ }))
		.first();
	await tab.click({ timeout: 4000 }).catch(() => {});
	await sleep(800);
}

// ---- MCP client (real calls) ----
let session;
async function rpc(method, params, id) {
	const response = await fetch(`${BASE}/mcp`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			authorization: `Bearer ${key}`,
			...(session ? { "mcp-session-id": session } : {}),
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			...(id ? { id } : {}),
			method,
			params,
		}),
	});
	session = response.headers.get("mcp-session-id") ?? session;
	const text = await response.text();
	if (!id) return undefined;
	return JSON.parse(text.match(/^data: (.*)$/m)?.[1] ?? text);
}
let nextId = 10;
async function tool(name, args) {
	const reply = await rpc("tools/call", { name, arguments: args }, nextId++);
	if (reply.error || reply.result?.isError) {
		throw new Error(
			`${name} failed: ${JSON.stringify(reply.error ?? reply.result).slice(0, 200)}`,
		);
	}
	return JSON.parse(reply.result.content[0].text);
}

// ---- the terminal replica ----
const TERMINAL = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#0d1117;color:#e6edf3;font:19px/1.5 Consolas,"Cascadia Mono",monospace}
header{padding:14px 20px;background:#161b22;border-bottom:1px solid #30363d;color:#8b949e;font-size:16px}
#out{padding:20px;white-space:pre-wrap;word-break:break-word}
.dim{color:#8b949e}.ok{color:#3fb950}.tool{color:#d2a8ff}.user{color:#79c0ff}
</style><header>agent démo · MCP « codesphere » (staging) · script</header><div id="out"></div>
<script>
const out=document.getElementById("out");
window.add=(html)=>{out.insertAdjacentHTML("beforeend",html+"\\n")};
window.typeLine=async(cls,text,ms)=>{const s=document.createElement("span");s.className=cls;out.appendChild(s);for(const c of text){s.textContent+=c;await new Promise(r=>setTimeout(r,ms))}out.insertAdjacentText("beforeend","\\n")};
</script>`;
// LAYOUT=vertical: terminal on top, page below, 1080x1920 (the 9:16 cut, public/clips/cut-agent.mp4).
const VERTICAL = process.env.LAYOUT === "vertical";
// Playwright records at the viewport size and does not upscale: record small, enlarge with ffmpeg.
const SCALE = 1;
const TERMINAL_HTML = VERTICAL
	? TERMINAL.replace("font:19px/1.5", "font:14px/1.45")
	: TERMINAL;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

async function recordAgent() {
	const SIDE = VERTICAL
		? { width: 540, height: 480 }
		: { width: 768, height: 864 };
	const VIDEO = { width: SIDE.width * SCALE, height: SIDE.height * SCALE };
	const browser = await chromium
		.launch(
			process.env.CHROME_PATH
				? { executablePath: process.env.CHROME_PATH }
				: { channel: "chrome" },
		)
		.catch(() => chromium.launch());
	opened.push(browser);
	const leftContext = await browser.newContext({
		viewport: SIDE,
		deviceScaleFactor: SCALE,
		recordVideo: { dir: TMP, size: VIDEO },
	});
	const rightContext = await launchProfile({
		viewport: SIDE,
		deviceScaleFactor: SCALE,
		recordVideo: { dir: TMP, size: VIDEO },
	});
	const [left, right] = await Promise.all([
		leftContext.newPage(),
		rightContext.newPage(),
	]);
	await Promise.all([
		left.setContent(TERMINAL_HTML),
		right.goto(questionUrl, { waitUntil: "networkidle" }),
	]);
	await sleep(2500);

	await left.evaluate(
		(html) => window.add(html),
		`<span class="dim">$ claude mcp add --transport http codesphere ${BASE}/mcp \
    --header "Authorization: Bearer cs_live_••••••••"</span>`,
	);
	await sleep(1500);
	await left.evaluate(() =>
		window.typeLine(
			"user",
			"❯ Lis la dernière question taguée mobile-money et propose une réponse",
			28,
		),
	);
	await sleep(1200);

	const list = await tool("questions_list", {
		tags: ["mobile-money"],
		limit: 1,
	});
	const found = list.items[0];
	await left.evaluate(
		(a) => window.add(a),
		`<span class="tool">● codesphere.questions_list</span> <span class="dim">{ tags: ["mobile-money"], limit: 1 }</span>`,
	);
	await sleep(700);
	await left.evaluate(
		(a) => window.add(a),
		`<span class="dim">  ⎿ 1 question : « ${esc(found.title)} »</span>`,
	);
	await sleep(1800);

	const full = await tool("questions_get", { id: found.id });
	await left.evaluate(
		(a) => window.add(a),
		`<span class="tool">● codesphere.questions_get</span> <span class="dim">{ id: "${found.id.slice(0, 8)}…" }</span>`,
	);
	await sleep(700);
	await left.evaluate(
		(a) => window.add(a),
		`<span class="dim">  ⎿ ${esc(full.status ?? found.status)} · ${esc(full.language ?? found.language)} · ${esc((full.tags ?? found.tags).join(", "))}</span>`,
	);
	await sleep(2200);

	await left.evaluate(
		(a) => window.add(a),
		`<span class="tool">● codesphere.answers_create</span> <span class="dim">{ questionId: "${found.id.slice(0, 8)}…", body: "${esc(ANSWER.slice(0, 48))}…" }</span>`,
	);
	const created = await tool("answers_create", {
		idempotencyKey: crypto.randomUUID(),
		questionId: found.id,
		body: ANSWER,
	});
	await sleep(700);
	await left.evaluate(
		(a) => window.add(a),
		`<span class="dim">  ⎿ réponse ${esc(String(created.id ?? "").slice(0, 8))}… publiée</span>`,
	);
	await sleep(1200);
	await left.evaluate(() =>
		window.add('<span class="ok">✔ Réponse envoyée.</span>'),
	);

	await dropQueryCache(right);
	await right.reload({ waitUntil: "networkidle" });
	// An Agent Answer no human has vouched for yet is folded (#244): show it, then its badge.
	await openAnswersTab(right);
	const folded = right.locator("details > summary").first();
	await folded.waitFor({ timeout: 15000 }).catch(async (error) => {
		await right
			.screenshot({ path: resolve(SCRATCH, "debug-right.png") })
			.catch(() => {});
		throw error;
	});
	await folded.scrollIntoViewIfNeeded();
	await sleep(2500);
	await folded.click();
	await sleep(1500);
	await right
		.getByText(/agent de/i)
		.first()
		.scrollIntoViewIfNeeded()
		.catch(() => {});
	await sleep(6000);

	const paths = [];
	for (const [page, context] of [
		[left, leftContext],
		[right, rightContext],
	]) {
		const video = page.video();
		await page.close();
		await context.close();
		paths.push(await video.path());
	}
	await browser.close();
	// Remotion's own ffmpeg has no hstack: use an ffmpeg on the PATH (or FFMPEG).
	execFileSync(
		process.env.FFMPEG ?? "ffmpeg",
		[
			"-y",
			"-loglevel",
			"error",
			"-i",
			paths[0],
			"-i",
			paths[1],
			"-filter_complex",
			VERTICAL
				? "[0:v][1:v]vstack=inputs=2,scale=1080:1920"
				: "[0:v][1:v]hstack=inputs=2,scale=1920:1080",
			"-c:v",
			"libx264",
			"-pix_fmt",
			"yuv420p",
			"-r",
			"30",
			"-an",
			"-shortest",
			resolve(OUT, VERTICAL ? "cut-agent.mp4" : "agent.mp4"),
		],
		{ stdio: "inherit" },
	);
	console.log(`saved public/clips/${VERTICAL ? "cut-agent" : "agent"}.mp4`);
}

async function recordBadge() {
	const SIZE = { width: 1536, height: 864 };
	const context = await launchProfile({
		viewport: SIZE,
		recordVideo: { dir: TMP, size: SIZE },
	});
	const page = await context.newPage();
	await page.goto(questionUrl, { waitUntil: "networkidle" });
	await sleep(1500);
	// The Agent's answer is folded until a human opens it (#244).
	await openAnswersTab(page);
	await page.locator("details > summary").first().click();
	await sleep(1500);
	await page.evaluate(() => {
		document.body.style.zoom = "1.3";
	});
	const accept = page.getByRole("button", { name: "Accepter" }).first();
	await accept.evaluate((element) =>
		element.scrollIntoView({ block: "center" }),
	);
	await sleep(2500);
	await accept.click();
	await sleep(4000);
	const video = page.video();
	await page.close();
	await context.close();
	copyFileSync(await video.path(), resolve(TMP, "badge.webm"));
	execFileSync(
		"npx",
		[
			"remotion",
			"ffmpeg",
			"-y",
			"-loglevel",
			"error",
			"-i",
			resolve(TMP, "badge.webm"),
			"-vf",
			"scale=1920:1080",
			"-c:v",
			"libx264",
			"-pix_fmt",
			"yuv420p",
			"-r",
			"30",
			"-an",
			resolve(OUT, "badge.mp4"),
		],
		{ stdio: "inherit", shell: true },
	);
	console.log("saved public/clips/badge.mp4");
}

try {
	await prepare();
	console.log("key renewed (kept in memory), demo Question published");
	await rpc(
		"initialize",
		{
			protocolVersion: "2025-03-26",
			capabilities: {},
			clientInfo: { name: "codesphere-demo", version: "1" },
		},
		1,
	);
	await rpc("notifications/initialized", {});
	await recordAgent();
	if (!VERTICAL) {
		await recordBadge();
	}
} catch (error) {
	console.error(
		`failed: ${
			String(error.message)
				.replaceAll(key ?? "\u0000", "[key]")
				.split("\n")[0]
		}`,
	);
	process.exitCode = 1;
} finally {
	// A failed step may leave a Chrome on the profile: close everything before the cleanup needs it.
	await Promise.allSettled(opened.map((item) => item.close()));
	await removeQuestion().catch((error) =>
		console.error(`cleanup failed: ${String(error.message).split("\n")[0]}`),
	);
	if (!process.exitCode) rmSync(TMP, { recursive: true, force: true });
}
console.log("DONE");
