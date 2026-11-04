// Copies the flags the platform offers into public/flags (#country). The SVGs are committed: run this
// only to refresh them after upgrading the `country-flag-icons` devDependency.
//
//   bun apps/web/scripts/copy-flags.mjs
//
// country-flag-icons is MIT-licensed (flags: 3:2 SVG, one file per ISO 3166-1 alpha-2 code). The
// list of countries is packages/ui/src/lib/countries.ts: a code missing from it is not copied, a
// code of the list without a file fails the unit test of that module.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules/country-flag-icons/3x2");
const to = join(root, "public/flags");
const list = readFileSync(
	join(root, "../../packages/ui/src/lib/countries.ts"),
	"utf8",
);
const codes = [...new Set(list.match(/"[A-Z]{2}"/g))].map((c) => c.slice(1, 3));
mkdirSync(to, { recursive: true });
for (const code of codes) {
	copyFileSync(join(from, `${code}.svg`), join(to, `${code}.svg`));
}
console.info(`${codes.length} flags copied to public/flags`);
