// Writes src/app/design-system/specimen-sources.generated.json: the code shown next to each
// specimen of /design-system. A test fails if the JSON drifts from the pages.
import { writeFileSync } from "node:fs";
import { buildSpecimenSources } from "../src/app/design-system/sources-extract.ts";

const dir = new URL("../src/app/design-system/", import.meta.url);
writeFileSync(
	new URL("specimen-sources.generated.json", dir),
	`${JSON.stringify(buildSpecimenSources(dir), null, "\t")}\n`,
);
