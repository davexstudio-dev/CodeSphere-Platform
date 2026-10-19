// Renders the PWA icons of apps/web from the brand colours (packages/ui styles): run by hand when
// the brand changes, the PNGs are committed. Needs Playwright's Chromium.
//   CHROME_PATH=/path/to/chrome bun run --cwd apps/e2e generate-pwa-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const PRIMARY = "oklch(0.515 0.139 35.1)";
const FOREGROUND = "oklch(0.99 0.01 75)";
const BACKGROUND = "oklch(0.975 0.012 75)";
const OUT = new URL("../web/public/icons/", import.meta.url);

const svg = ({ size, maskable }) => {
	// A maskable icon keeps its glyph inside the central 80% (the "safe zone") on a full-bleed
	// background; the plain icon is a disc on a transparent corner-rounded square.
	const radius = maskable ? 0 : size * 0.22;
	const glyph = size * (maskable ? 0.34 : 0.42);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
	<rect width="${size}" height="${size}" rx="${radius}" fill="${PRIMARY}"/>
	<circle cx="${size / 2}" cy="${size / 2}" r="${glyph}" fill="none" stroke="${FOREGROUND}" stroke-width="${size * 0.045}"/>
	<circle cx="${size / 2}" cy="${size / 2}" r="${glyph * 0.42}" fill="${FOREGROUND}"/>
</svg>`;
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH,
});
const page = await browser.newPage();

// The hex of each colour as the browser resolves it, for the manifest.
const hex = await page.evaluate(
	([colors]) => {
		const context = document.createElement("canvas").getContext("2d", {
			willReadFrequently: true,
		});
		return colors.map((color) => {
			context.clearRect(0, 0, 1, 1);
			context.fillStyle = color;
			context.fillRect(0, 0, 1, 1);
			const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
			return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
		});
	},
	[[PRIMARY, BACKGROUND]],
);
console.log(JSON.stringify({ themeColor: hex[0], backgroundColor: hex[1] }));

for (const [name, size, maskable] of [
	["icon-192.png", 192, false],
	["icon-512.png", 512, false],
	["icon-maskable-512.png", 512, true],
	["apple-touch-icon.png", 180, true],
]) {
	await page.setViewportSize({ width: size, height: size });
	await page.setContent(
		`<body style="margin:0;background:transparent">${svg({ size, maskable })}</body>`,
	);
	const png = await page.screenshot({ omitBackground: true, type: "png" });
	writeFileSync(new URL(name, OUT), png);
}
await browser.close();
