// Reads the design-system pages and returns, for each <Specimen label="…">, the code that renders
// it: the JSX as written plus the import lines of the components it uses. The result is committed
// as specimen-sources.generated.json (`bun run ds:sources`); a test fails when it drifts, so the
// code shown next to a component is always the code of the page.
import { readFileSync } from "node:fs";

type SpecimenSource = {
	/** The import lines of the components the JSX uses. */
	imports: string;
	/** The JSX as written in the page. */
	jsx: string;
	/** Where the components it uses live, from the repository root. */
	files: string[];
};

const PAGES = ["page.tsx", "motion-specimens.tsx"];
const UI_PREFIX = "@codesphere/ui/";

type ImportInfo = { module: string; name: string; imported: string };

/** identifier used in the file -> where it comes from. */
function parseImports(text: string) {
	const found = new Map<string, ImportInfo>();
	const pattern = /import\s+(type\s+)?([\s\S]*?)\s+from\s+"([^"]+)";/g;
	for (const match of text.matchAll(pattern)) {
		const [, typeOnly, clause = "", module = ""] = match;
		if (typeOnly) {
			continue;
		}
		const named = clause.match(/\{([\s\S]*)\}/)?.[1] ?? "";
		for (const part of named.split(",")) {
			const spec = part.trim().replace(/^type\s+/, "");
			if (!spec || part.trim().startsWith("type ")) {
				continue;
			}
			const [imported = "", alias] = spec.split(/\s+as\s+/);
			found.set(alias ?? imported, {
				module,
				name: alias ?? imported,
				imported,
			});
		}
		const def = clause
			.replace(/\{[\s\S]*\}/, "")
			.replace(/,/g, "")
			.trim();
		if (def && !def.startsWith("*")) {
			found.set(def, { module, name: def, imported: "default" });
		}
	}
	return found;
}

function dedent(body: string) {
	const lines = body.replace(/\r/g, "").split("\n");
	while (lines.length && !lines[0]?.trim()) {
		lines.shift();
	}
	while (lines.length && !lines[lines.length - 1]?.trim()) {
		lines.pop();
	}
	const indent = Math.min(
		...lines
			.filter((line) => line.trim())
			.map((line) => line.match(/^\t*/)?.[0].length ?? 0),
	);
	return lines.map((line) => line.slice(indent)).join("\n");
}

const sourceFile = (module: string) =>
	module.startsWith(UI_PREFIX)
		? `packages/ui/src/${module.slice(UI_PREFIX.length)}.tsx`
		: null;

export function buildSpecimenSources(dir: URL): Record<string, SpecimenSource> {
	const result: Record<string, SpecimenSource> = {};
	for (const page of PAGES) {
		const text = readFileSync(new URL(page, dir), "utf8").replace(/\r/g, "");
		const imports = parseImports(text);
		for (const open of text.matchAll(/<Specimen label="([^"]+)">/g)) {
			const label = open[1] ?? "";
			const start = (open.index ?? 0) + open[0].length;
			const end = text.indexOf("</Specimen>", start);
			const body = dedent(text.slice(start, end));

			const byModule = new Map<string, string[]>();
			const used = new Set(
				[...body.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map((m) => m[1] ?? ""),
			);
			for (const name of [...used].sort()) {
				const info = imports.get(name);
				if (!info) {
					continue;
				}
				const names = byModule.get(info.module) ?? [];
				names.push(
					info.imported === "default"
						? `__default:${name}`
						: info.imported === name
							? name
							: `${info.imported} as ${name}`,
				);
				byModule.set(info.module, names);
			}
			const lines = [...byModule.entries()]
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([module, names]) => {
					const defaults = names.filter((n) => n.startsWith("__default:"));
					const named = names.filter((n) => !n.startsWith("__default:"));
					const head = defaults.map((n) => n.slice("__default:".length));
					const clause = [
						...head,
						...(named.length ? [`{ ${named.join(", ")} }`] : []),
					].join(", ");
					return `import ${clause} from "${module}";`;
				});

			result[label] = {
				imports: lines.join("\n"),
				jsx: body,
				files: [...byModule.keys()]
					.map(sourceFile)
					.filter((file): file is string => file !== null)
					.sort(),
			};
		}
	}
	return result;
}

export function specimenLabels(dir: URL) {
	return PAGES.flatMap((page) =>
		[
			...readFileSync(new URL(page, dir), "utf8").matchAll(
				/<Specimen label="([^"]+)">/g,
			),
		].map((m) => m[1] ?? ""),
	);
}
