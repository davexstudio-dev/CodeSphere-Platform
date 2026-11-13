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
	const planned = (s.planned ?? [])
		.map((b) => `<li>${inline(b)}</li>`)
		.join("");
	const team = (s.team ?? [])
		.map(
			([n, r]) => `<li><strong>${esc(n)}</strong><span>${esc(r)}</span></li>`,
		)
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

// Charte du projet : jetons de packages/ui/src/styles/globals.css (terracotta, fonds chauds, Outfit).
// Sombre par défaut ; `--light` produit la variante crème (fichiers *.light.*).
const light = process.argv.includes("--light");
const suffix = light ? ".light" : "";
const theme = light
	? "--bg:oklch(0.975 0.012 75);--fg:oklch(0.24 0.03 50);--muted:oklch(0.5 0.03 60);--accent:oklch(0.515 0.139 35.1);--card:oklch(0.995 0.005 75);--line:oklch(0.89 0.02 70);--warn:oklch(0.93 0.05 80);--warn-ink:oklch(0.515 0.139 35.1);--on-warn:oklch(0.24 0.03 50)"
	: "--bg:oklch(0.2 0.02 50);--fg:oklch(0.95 0.015 75);--muted:oklch(0.72 0.03 70);--accent:oklch(0.7 0.14 38);--card:oklch(0.25 0.025 50);--line:oklch(0.34 0.03 50);--warn:oklch(0.93 0.05 80);--warn-ink:oklch(0.93 0.05 80);--on-warn:oklch(0.24 0.03 50)";
// Outfit (OFL) embarquée en base64 : le rendu ne dépend pas de la machine.
const fontFace = (file, range) =>
	`@font-face{font-family:Outfit;font-weight:100 900;src:url(data:font/woff2;base64,${readFileSync(resolve("assets/fonts", file)).toString("base64")}) format("woff2");unicode-range:${range}}`;
const fonts =
	fontFace(
		"outfit-latin-ext.woff2",
		"U+100-2BA,U+2BD-2C5,U+2C7-2CC,U+2CE-2D7,U+2DD-2FF,U+304,U+308,U+329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF",
	) +
	fontFace(
		"outfit-latin.woff2",
		"U+00-FF,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
	);

const css = `${fonts}
:root{${theme}}
@page{size:1920px 1080px;margin:0}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font-family:Outfit,"Segoe UI",system-ui,sans-serif}
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
.planned{margin-top:20px;padding:16px 26px;border:2px dashed var(--line);border-radius:14px}
.planned b{color:var(--warn-ink);text-transform:uppercase;letter-spacing:.08em;font-size:24px}
.planned ul{font-size:28px;margin-top:8px}
.note{color:var(--muted);font-size:28px;margin-top:28px}
figure{margin:0;height:100%;max-height:780px;display:flex;align-items:center;justify-content:center}
figure img{max-width:100%;max-height:100%;border-radius:16px;box-shadow:0 20px 60px oklch(0 0 0 / .45);object-fit:contain}
figure.missing{flex-direction:column;gap:12px;border:3px dashed var(--line);border-radius:16px;color:var(--muted);width:100%}
figure.missing span{font-size:40px;font-weight:700}
figure.missing small{font-size:24px;max-width:80%;text-align:center}
mark.todo{background:var(--warn);color:var(--on-warn);padding:0 .25em;border-radius:6px}
.team{list-style:none;padding:0;font-size:40px}
.team li{display:flex;gap:24px;align-items:baseline}
.team span{color:var(--muted);font-size:30px}
.cta{font-size:72px;color:var(--accent);font-weight:800;margin-top:40px}
`;

const todos = [];
for (const [lang, deck] of Object.entries(slides)) {
	const total = deck.slides.length;
	const body = deck.slides
		.map((s, i) => slideHtml(s, i, total, deck.labels))
		.join("\n");
	const html = `<!doctype html><html lang="${deck.lang}"><head><meta charset="utf-8"><title>${esc(deck.deckTitle)}</title><style>${css}</style></head><body>${body}</body></html>`;
	writeFileSync(resolve(out, `deck.${lang}${suffix}.html`), html);
	for (const m of html.matchAll(/<mark class="todo">([^<]+)<\/mark>/g))
		todos.push(`${lang}: ${m[1]}`);
	for (const s of deck.slides)
		if (s.image && !existsSync(resolve("assets", s.image)))
			todos.push(`${lang}: capture manquante assets/${s.image}`);
}

if (!process.argv.includes("--no-pdf")) {
	const require = createRequire(resolve("../../../apps/e2e/package.json"));
	const { chromium } = require("@playwright/test");
	const opts = process.env.CHROME_PATH
		? { executablePath: process.env.CHROME_PATH }
		: {};
	let browser;
	try {
		browser = await chromium.launch({ channel: "chrome", ...opts });
	} catch {
		browser = await chromium.launch(opts);
	}
	for (const lang of Object.keys(slides)) {
		const page = await browser.newPage();
		await page.goto(pathToFileURL(resolve(out, `deck.${lang}${suffix}.html`)).href);
		await page.pdf({
			path: resolve(out, `codesphere-pitch.${lang}${suffix}.pdf`),
			width: "1920px",
			height: "1080px",
			printBackground: true,
		});
		await page.close();
	}
	await browser.close();
}

console.log(`Deck généré dans ${out}`);
if (todos.length)
	console.log(
		`\nÀ compléter avant de figer (${todos.length}) :\n- ${[...new Set(todos)].join("\n- ")}`,
	);
