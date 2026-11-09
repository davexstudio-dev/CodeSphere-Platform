// Licence audit of every npm package in bun.lock (CADEV rules, art. 6: permissive licences only).
//   bun run licenses                       summary; exit 1 on GPL/AGPL/LGPL, exit 0 otherwise
//   bun run licenses -- --out=FILE.md      also write the full component/licence declaration
// MPL-2.0 is accepted by the organisers on condition that it is declared in the "technologies" part of
// the project registration: it is listed apart and never fails the audit. Any other weak copyleft
// (MPL-1.1, EPL, CDDL...) stays "to review", because the confirmation only covers MPL-2.0.
// A package's licence is read from node_modules when installed, otherwise from the npm registry
// (platform-specific binaries are not installed on every OS). Only the declared `license` field is
// checked: it cannot detect a permissive package that bundles copyleft code.
import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

const FORBIDDEN = /(^|[^A-Z])(A|L)?GPL/i;
const REVIEW =
	/MPL|EPL|CDDL|CC-BY-SA|SSPL|BUSL|UNKNOWN|UNLICENSED|SEE LICENSE/i;
// Accepted by the organisers, but must be declared in the registration's "technologies" part.
const DECLARE = /^MPL-2\.0$/i;

const outArg = process.argv.find((arg) => arg.startsWith("--out="));
const outFile = outArg?.slice("--out=".length);

const lockfile = JSON.parse(
	readFileSync("bun.lock", "utf8").replace(/,(\s*[}\]])/g, "$1"),
);
const ids = new Set();
for (const entry of Object.values(lockfile.packages)) {
	const id = entry[0];
	if (id && !id.includes("@workspace:")) {
		ids.add(id);
	}
}

const installed = new Map();
function scan(nodeModules) {
	if (!existsSync(nodeModules)) {
		return;
	}
	for (const name of readdirSync(nodeModules)) {
		if (name === ".bin" || name === ".cache") {
			continue;
		}
		const dir = join(nodeModules, name);
		if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
			continue;
		}
		if (name === ".bun") {
			for (const hashed of readdirSync(dir)) {
				scan(join(dir, hashed, "node_modules"));
			}
		} else if (name.startsWith("@")) {
			scan(dir);
		} else if (existsSync(join(dir, "package.json"))) {
			try {
				const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
				installed.set(`${pkg.name}@${pkg.version}`, readLicense(pkg));
				scan(join(dir, "node_modules"));
			} catch {
				// Unreadable package.json: the registry lookup below covers it.
			}
		}
	}
}

function readLicense(pkg) {
	if (typeof pkg.license === "string") {
		return pkg.license;
	}
	if (pkg.license?.type) {
		return pkg.license.type;
	}
	if (Array.isArray(pkg.licenses)) {
		return pkg.licenses.map((l) => l.type).join(" OR ");
	}
	return "UNKNOWN";
}

scan("node_modules");
for (const dir of readdirSync(".", { withFileTypes: true })) {
	if (dir.isDirectory() && ["apps", "packages"].includes(dir.name)) {
		for (const workspace of readdirSync(dir.name)) {
			scan(join(dir.name, workspace, "node_modules"));
		}
	}
}

const licenses = new Map();
const missing = [];
for (const id of ids) {
	if (installed.has(id)) {
		licenses.set(id, installed.get(id));
	} else {
		missing.push(id);
	}
}

async function fromRegistry(id) {
	const at = id.lastIndexOf("@");
	const name = id.slice(0, at).replace("/", "%2f");
	try {
		const response = await fetch(
			`https://registry.npmjs.org/${name}/${id.slice(at + 1)}`,
		);
		licenses.set(id, readLicense(await response.json()));
	} catch {
		licenses.set(id, "UNKNOWN (registry lookup failed)");
	}
}

const queue = [...missing];
await Promise.all(
	Array.from({ length: 16 }, async () => {
		while (queue.length > 0) {
			await fromRegistry(queue.pop());
		}
	}),
);

/**
 * Dual-licensed packages ("MIT OR GPL-3.0") are fine if one alternative is permissive.
 * Verdicts, best first: ok, declare (MPL-2.0), review, forbidden.
 */
function classify(license) {
	const alternatives = license
		.replace(/[()]/g, "")
		.split(/\s+OR\s+/i)
		.map((alt) => alt.trim());
	const verdicts = alternatives.map((alt) =>
		DECLARE.test(alt)
			? "declare"
			: FORBIDDEN.test(alt)
				? "forbidden"
				: REVIEW.test(alt)
					? "review"
					: "ok",
	);
	for (const verdict of ["ok", "declare", "review"]) {
		if (verdicts.includes(verdict)) {
			return verdict;
		}
	}
	return "forbidden";
}

const rows = [...licenses].sort(([a], [b]) => a.localeCompare(b));
const forbidden = rows.filter(
	([, license]) => classify(license) === "forbidden",
);
const review = rows.filter(([, license]) => classify(license) === "review");
const declare = rows.filter(([, license]) => classify(license) === "declare");

const counts = new Map();
for (const [, license] of rows) {
	counts.set(license, (counts.get(license) ?? 0) + 1);
}
console.log(
	`${rows.length} packages (${missing.length} resolved via the npm registry)\n`,
);
for (const [license, count] of [...counts].sort((a, b) => b[1] - a[1])) {
	console.log(`${String(count).padStart(5)}  ${license}`);
}
if (declare.length > 0) {
	console.log(
		"\nAccepted by the organisers, to declare in the registration's technologies part (MPL-2.0):",
	);
	for (const [id, license] of declare) {
		console.log(`  ${id}  ${license}`);
	}
}
if (review.length > 0) {
	console.log("\nTo review (weak copyleft or unclear):");
	for (const [id, license] of review) {
		console.log(`  ${id}  ${license}`);
	}
}
if (forbidden.length > 0) {
	console.log("\nFORBIDDEN (GPL/AGPL/LGPL, project inadmissible):");
	for (const [id, license] of forbidden) {
		console.log(`  ${id}  ${license}`);
	}
}

if (outFile) {
	const lines = [
		"# Third-party components and licences",
		"",
		"Generated by `bun run licenses` from `bun.lock`. Do not edit by hand.",
		"",
		"| Package | Licence |",
		"|---|---|",
		...rows.map(([id, license]) => `| ${id} | ${license} |`),
		"",
		...(declare.length > 0
			? [
					"## To declare in the registration's technologies part",
					"",
					"MPL-2.0 is accepted by the organisers on condition that it is declared there.",
					"",
					...declare.map(([id]) => `- ${id}`),
					"",
				]
			: []),
		"## Tools outside the product (not in bun.lock)",
		"",
		"Used to make the CADEV video, never installed by the platform or shipped in its images.",
		"",
		"- Remotion 4.0.542 (`video/`, #358): Remotion licence, free for individuals, non-profits and for-profit organisations of up to 3 employees.",
		"- ElevenLabs (online service): synthetic French voice-over of the video, under its terms of use; declared in `docs/cadev/ai-usage.md`.",
		"",
	];
	writeFileSync(outFile, lines.join("\n"));
	console.log(`\nDeclaration written to ${outFile}`);
}

process.exit(forbidden.length > 0 ? 1 : 0);
