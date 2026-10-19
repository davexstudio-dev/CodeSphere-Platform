// Turns docs/roadmap.yaml into src/lib/roadmap.generated.json (#252). The page reads the JSON
// because the YAML cannot be imported by Next or the Worker; a test fails if the two drift.
import { readFileSync, writeFileSync } from "node:fs";

const source = new URL("../../../docs/roadmap.yaml", import.meta.url);
const target = new URL("../src/lib/roadmap.generated.json", import.meta.url);
const data = Bun.YAML.parse(readFileSync(source, "utf8"));
writeFileSync(target, `${JSON.stringify(data, null, "\t")}\n`);
