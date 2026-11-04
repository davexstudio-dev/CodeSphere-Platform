// Builds src/sw/sw.ts into public/sw.js (#249): a static file, served by the Worker's assets like
// any other, so nothing is compiled at request time. Run before `next build` / `cf:build`.
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

function revision() {
	if (process.env.GIT_SHA) return process.env.GIT_SHA;
	try {
		return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
	} catch {
		return String(Date.now());
	}
}

await build({
	entryPoints: [fileURLToPath(new URL("../src/sw/sw.ts", import.meta.url))],
	outfile: fileURLToPath(new URL("../public/sw.js", import.meta.url)),
	bundle: true,
	minify: true,
	format: "iife",
	target: "es2020",
	define: { __BUILD_ID__: JSON.stringify(revision()) },
	logLevel: "info",
});
