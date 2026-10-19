// Usage: node lighthouse/run.cjs urls <origin>   -> prints the pages to audit, comma-separated
//        node lighthouse/run.cjs report            -> prints the Markdown table of .lighthouseci
const { readFileSync } = require("node:fs");
const { pickUrls, renderReport } = require("./lib.cjs");

async function main() {
	const [command, arg] = process.argv.slice(2);
	if (command === "urls") {
		const urls = await pickUrls(arg, async (url) => {
			const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
			if (!response.ok) throw new Error(`${url}: ${response.status}`);
			return response.json();
		});
		console.log(urls.join(","));
	} else if (command === "report") {
		const manifest = JSON.parse(
			readFileSync(".lighthouseci/manifest.json", "utf8"),
		);
		const runs = manifest
			.filter((run) => run.isRepresentativeRun)
			.map((run) => ({
				url: run.url,
				audits: JSON.parse(readFileSync(run.jsonPath, "utf8")).audits,
			}));
		console.log(renderReport(runs));
	} else {
		console.error("usage: run.cjs urls <origin> | report");
		process.exit(2);
	}
}
main().catch((error) => {
	console.error(error);
	process.exit(1);
});
