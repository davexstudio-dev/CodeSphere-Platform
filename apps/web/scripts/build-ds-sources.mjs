// Writes src/app/design-system/specimen-sources.generated.json: the code shown next to each
// specimen of /design-system. A test fails if the JSON drifts from the pages.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSpecimenSources } from "../src/app/design-system/sources-extract.ts";

const dir = new URL("../src/app/design-system/", import.meta.url);
const target = new URL("specimen-sources.generated.json", dir);
writeFileSync(
	target,
	`${JSON.stringify(buildSpecimenSources(dir), null, "\t")}\n`,
);
// CI runs Biome on changed files: leave the JSON in the shape Biome prints.
Bun.spawnSync(["bunx", "biome", "format", "--write", fileURLToPath(target)], {
	stdout: "ignore",
	stderr: "inherit",
});
