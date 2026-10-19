// Usage: node lighthouse/run.cjs urls <origin>
//          prints the pages to audit, comma-separated; exit 3 when Cloudflare challenges the runner
//        node lighthouse/run.cjs report
//          prints the Markdown table of .lighthouseci; exit 1 when a blocking weight budget is over
const { readFileSync } = require("node:fs");
const {
	ChallengedError,
	blockingFailures,
	evaluate,
	pickUrls,
	renderReport,
} = require("./lib.cjs");

async function fetchJson(url) {
	const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
	const challenged =
		response.status === 403 &&
		/^challenge/i.test(response.headers.get("cf-mitigated") ?? "");
	const body = response.ok ? await response.json().catch(() => null) : null;
	return { status: response.status, challenged, body };
}

async function main() {
	const [command, arg] = process.argv.slice(2);
	if (command === "urls") {
		try {
			const urls = await pickUrls(arg, fetchJson, (message) =>
				console.error(`::warning::${message}`),
			);
			console.log(urls.join(","));
		} catch (error) {
			if (error instanceof ChallengedError) {
				console.error(error.message);
				process.exit(3);
			}
			throw error;
		}
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
		const failures = blockingFailures(evaluate(runs));
		if (failures.length > 0) {
			console.error(`::error::Over budget: ${failures.join(", ")}`);
			process.exitCode = 1;
		}
	} else {
		console.error("usage: run.cjs urls <origin> | report");
		process.exit(2);
	}
}
main().catch((error) => {
	console.error(error);
	process.exit(1);
});
