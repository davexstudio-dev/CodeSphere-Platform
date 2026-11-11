// Génère out/deck.fr.html, out/deck.en.html et leurs PDF (16:9) à partir de slides.mjs (#358).
//   cd docs/cadev/deck && node build.mjs [--no-pdf]
// Chrome : celui de Playwright (apps/e2e), ou CHROME_PATH, ou le Chrome installé. Aucune dépendance ajoutée.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { slides } from "./slides.mjs";

const out = resolve("out");
mkdirSync(out, { recursive: true });

const esc = (s) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// **gras**, `code`, et [champ à relever] mis en évidence
const inline = (s) =>
	esc(s)
		.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
		.replace(/`(.+?)`/g, "<code>$1</code>")
		.replace(/\[([^\]]+)\]/g, '<mark class="todo">$1</mark>');

function figure(s, labels) {
	if (!s.image) return "";
	const file = resolve("assets", s.image);
	if (existsSync(file)) {
		const b64 = readFileSync(file).toString("base64");
		return `<figure><img alt="${esc(s.imageAlt)}" src="data:image/png;base64,${b64}"></figure>`;
	}
	return `<figure class="missing"><span>${labels.demo}</span><small>${esc(s.imageAlt)}</small></figure>`;
}

function slideHtml(s, i, total, labels) {
	const list = (s.bullets ?? []).map((b) => `<li>${inline(b)}</li>`).join("");
	const planned = (s.planned ?? []).map((b) => `<li>${inline(b)}</li>`).join("");
	const team = (s.team ?? [])
		.map(([n, r]) => `<li><strong>${esc(n)}</strong><span>${esc(r)}</span></li>`)
		.join("");
	return `<section class="slide ${s.image ? "with-fig" : ""} ${(s.bullets ?? []).length >= 5 ? "dense" : ""}" id="${s.id}">
<header><span class="kicker">${esc(s.kicker)}</span><span class="n">${i + 1} / ${total}</span></header>
<div class="body"><div class="text">
<h1>${esc(s.title)}</h1>
${s.quote ? `<blockquote>${inline(s.quote)}</blockquote>` : ""}
${list ? `<ul>${list}</ul>` : ""}
${planned ? `<div class="planned"><b>${labels.planned}</b><ul>${planned}</ul></div>` : ""}
${s.note ? `<p class="note">${inline(s.note)}</p>` : ""}
${team ? `<ul class="team">${team}</ul>` : ""}
${s.cta ? `<p class="cta">${esc(s.cta)}</p>` : ""}
</div>${figure(s, labels)}</div></section>`;
}

const css = `
:root{--bg:#0f1720;--fg:#f4f6f8;--muted:#9fb0c0;--accent:#2dd4a7;--card:#18232f;--warn:#fbbf24}
@page{size:1920px 1080px;margin:0}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font-family:Inter,"Segoe UI",system-ui,sans-serif}
.slide{width:1920px;height:1080px;padding:64px 96px;display:flex;flex-direction:column;break-after:page;overflow:hidden}
header{display:flex;justify-content:space-between;color:var(--muted);font-size:26px;letter-spacing:.08em;text-transform:uppercase}
.kicker{color:var(--accent);font-weight:700}
.body{flex:1;display:grid;grid-template-columns:1fr;gap:64px;align-items:center;min-height:0}
.with-fig .body{grid-template-columns:1.1fr 1fr}
h1{font-size:62px;line-height:1.08;margin:0 0 28px;letter-spacing:-.02em}
ul{margin:0;padding-left:1.1em;font-size:30px;line-height:1.35}
li{margin:0 0 14px}
code{font-family:"JetBrains Mono",Consolas,monospace;font-size:.86em;background:var(--card);padding:.05em .3em;border-radius:6px}
blockquote{margin:0 0 26px;padding:18px 26px;border-left:6px solid var(--accent);background:var(--card);font-size:28px;line-height:1.4;border-radius:0 12px 12px 0}
.dense h1{font-size:50px;margin-bottom:20px}
.dense ul{font-size:25px;line-height:1.3}
.dense li{margin-bottom:9px}
.planned{margin-top:20px;padding:16px 26px;border:2px dashed var(--muted);border-radius:14px}
.planned b{color:var(--warn);text-transform:uppercase;letter-spacing:.08em;font-size:24px}
.planned ul{font-size:28px;margin-top:8px}
.note{color:var(--muted);font-size:28px;margin-top:28px}
figure{margin:0;height:100%;max-height:780px;display:flex;align-items:center;justify-content:center}
figure img{max-width:100%;max-height:100%;border-radius:16px;box-shadow:0 20px 60px #0008;object-fit:contain}
figure.missing{flex-direction:column;gap:12px;border:3px dashed var(--muted);border-radius:16px;color:var(--muted);width:100%}
figure.missing span{font-size:40px;font-weight:700}
figure.missing small{font-size:24px;max-width:80%;text-align:center}
mark.todo{background:var(--warn);color:#111;padding:0 .25em;border-radius:6px}
.team{list-style:none;padding:0;font-size:40px}
.team li{display:flex;gap:24px;align-items:baseline}
.team span{color:var(--muted);font-size:30px}
.cta{font-size:72px;color:var(--accent);font-weight:800;margin-top:40px}
`;

const todos = [];
for (const [lang, deck] of Object.entries(slides)) {
	const total = deck.slides.length;
	const body = deck.slides.map((s, i) => slideHtml(s, i, total, deck.labels)).join("\n");
	const html = `<!doctype html><html lang="${deck.lang}"><head><meta charset="utf-8"><title>${esc(deck.deckTitle)}</title><style>${css}</style></head><body>${body}</body></html>`;
	writeFileSync(resolve(out, `deck.${lang}.html`), html);
	for (const m of html.matchAll(/<mark class="todo">([^<]+)<\/mark>/g)) todos.push(`${lang}: ${m[1]}`);
	for (const s of deck.slides)
		if (s.image && !existsSync(resolve("assets", s.image)))
			todos.push(`${lang}: capture manquante assets/${s.image}`);
}

if (!process.argv.includes("--no-pdf")) {
	const require = createRequire(resolve("../../../apps/e2e/package.json"));
	const { chromium } = require("@playwright/test");
	const opts = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
	let browser;
	try {
		browser = await chromium.launch({ channel: "chrome", ...opts });
	} catch {
		browser = await chromium.launch(opts);
	}
	for (const lang of Object.keys(slides)) {
		const page = await browser.newPage();
		await page.goto(pathToFileURL(resolve(out, `deck.${lang}.html`)).href);
		await page.pdf({
			path: resolve(out, `codesphere-pitch.${lang}.pdf`),
			width: "1920px",
			height: "1080px",
			printBackground: true,
		});
		await page.close();
	}
	await browser.close();
}

console.log(`Deck généré dans ${out}`);
if (todos.length) console.log(`\nÀ compléter avant de figer (${todos.length}) :\n- ${[...new Set(todos)].join("\n- ")}`);
