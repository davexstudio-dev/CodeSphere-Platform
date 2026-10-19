// Performance budgets of map #224, enforced by Lighthouse CI on every pull request preview (#248).
// Plain CommonJS: `lhci` loads its config with require().

const KB = 1024;

/** Slow 4G, 4x slower CPU: the profile of an average phone on the networks of our Members. */
const MOBILE_SLOW_4G = {
	formFactor: "mobile",
	throttlingMethod: "simulate",
	throttling: {
		rttMs: 150,
		throughputKbps: 1.6 * 1024,
		requestLatencyMs: 150 * 3.75,
		downloadThroughputKbps: 1.6 * 1024 * 0.9,
		uploadThroughputKbps: 750 * 0.9,
		cpuSlowdownMultiplier: 4,
	},
};

// LCP and initial JS fail a pull request from day one; the other budgets only warn until this
// date (two weeks after the gate was introduced), then fail too.
const WARN_UNTIL = Date.parse("2026-11-02T00:00:00Z");

/** @param {number} now */
const laterLevel = (now) => (now >= WARN_UNTIL ? "error" : "warn");

/**
 * Budgets lhci asserts itself (timings). INP needs a real interaction, so the lab proxy is Total
 * Blocking Time; the field value comes from #251.
 * @param {number} [now]
 * @returns {Record<string, ["error" | "warn", { maxNumericValue: number, aggregationMethod: "median" }]>}
 */
function assertions(now = Date.now()) {
	const later = laterLevel(now);
	return {
		"largest-contentful-paint": [
			"error",
			{ maxNumericValue: 2500, aggregationMethod: "median" },
		],
		"total-blocking-time": [
			later,
			{ maxNumericValue: 200, aggregationMethod: "median" },
		],
		"cumulative-layout-shift": [
			later,
			{ maxNumericValue: 0.1, aggregationMethod: "median" },
		],
	};
}

/**
 * Weight budgets, in bytes over the wire (compressed). lhci's own `resource-summary:*:size`
 * assertions count uncompressed bytes, so these are checked here against `transferSize`.
 * @param {number} [now]
 * @returns {{ script: { level: "error" | "warn", max: number }, total: { level: "error" | "warn", max: number } }}
 */
function sizeBudgets(now = Date.now()) {
	return {
		script: { level: "error", max: 150 * KB },
		total: { level: laterLevel(now), max: 300 * KB },
	};
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @param {number} [now]
 */
function config(env = process.env, now = Date.now()) {
	const urls = (env.LHCI_URLS ?? "")
		.split(",")
		.map((url) => url.trim())
		.filter(Boolean);
	if (urls.length === 0) {
		throw new Error("LHCI_URLS is empty: set it to the pages to audit");
	}
	return {
		ci: {
			collect: {
				url: urls,
				numberOfRuns: 3,
				settings: {
					...MOBILE_SLOW_4G,
					onlyCategories: ["performance"],
					chromeFlags: "--no-sandbox --headless=new",
				},
			},
			assert: { assertions: assertions(now) },
			upload: { target: "filesystem", outputDir: ".lighthouseci" },
		},
	};
}

/** Thrown by `pickUrls` when Cloudflare serves its bot challenge instead of the site. */
class ChallengedError extends Error {}

/**
 * The pages to audit: home (feed), ask form, and the first Question and Hackathon the preview
 * serves. `fetchJson` is injectable and resolves `{ status, challenged, body }`; a page whose
 * data is missing is reported through `warn`, never faked.
 * @param {string} origin
 * @param {(url: string) => Promise<{ status: number, challenged: boolean, body: any }>} fetchJson
 * @param {(message: string) => void} [warn]
 * @returns {Promise<string[]>}
 */
async function pickUrls(origin, fetchJson, warn = () => {}) {
	const base = origin.replace(/\/$/, "");
	const home = await fetchJson(`${base}/`).catch(() => null);
	if (home?.challenged) {
		throw new ChallengedError(
			"Cloudflare challenged the runner: the preview cannot be audited",
		);
	}
	const urls = [`${base}/`, `${base}/ask`, `${base}/roadmap`];
	const lookup = async (path, key, page) => {
		const response = await fetchJson(`${base}${path}`).catch(() => null);
		const value = response?.body?.items?.[0]?.[key];
		if (!value) {
			warn(`no ${page} found on the preview (${path}): not audited`);
			return;
		}
		urls.push(`${base}/${page}s/${encodeURIComponent(value)}`);
	};
	await lookup("/api/v1/questions?limit=1", "id", "question");
	await lookup("/api/v1/hackathons?limit=1", "slug", "hackathon");
	return urls;
}

/**
 * Weight and timing of each page against the budgets. `level` is the budget's, so a warn-only
 * metric is told apart from a blocking one.
 * @param {{ url: string, audits: any }[]} runs
 * @param {number} [now]
 */
function evaluate(runs, now = Date.now()) {
	const timings = assertions(now);
	const sizes = sizeBudgets(now);
	return runs.map(({ url, audits }) => {
		const items = audits?.["resource-summary"]?.details?.items ?? [];
		const transfer = (type) =>
			items.find((item) => item.resourceType === type)?.transferSize;
		const metric = (value, { level, max }) => ({
			value,
			max,
			level,
			// A missing value is a failure: a page that could not be measured is not within budget.
			ok: typeof value === "number" && value <= max,
		});
		const timing = (name) => {
			const [level, { maxNumericValue }] = timings[name];
			return metric(audits?.[name]?.numericValue, {
				level,
				max: maxNumericValue,
			});
		};
		return {
			path: new URL(url).pathname,
			lcp: timing("largest-contentful-paint"),
			tbt: timing("total-blocking-time"),
			cls: timing("cumulative-layout-shift"),
			js: metric(transfer("script"), sizes.script),
			total: metric(transfer("total"), sizes.total),
		};
	});
}

/** The blocking failures of `evaluate`: what must fail the job. */
function blockingFailures(rows) {
	return rows.flatMap((row) =>
		["lcp", "tbt", "cls", "js", "total"]
			.filter((name) => !row[name].ok && row[name].level === "error")
			.map((name) => `${row.path}: ${name}`),
	);
}

/**
 * Markdown table for the job summary and the pull request. ✅ within budget, ❌ over a blocking
 * budget, ⚠️ over a budget that only warns for now.
 * @param {{ url: string, audits: any }[]} runs
 * @param {number} [now]
 */
function renderReport(runs, now = Date.now()) {
	const rows = evaluate(runs, now);
	const budgets = assertions(now);
	const sizes = sizeBudgets(now);
	const cell = (metric, format) => {
		const mark = metric.ok ? "✅" : metric.level === "error" ? "❌" : "⚠️";
		const shown =
			typeof metric.value === "number" ? format(metric.value) : "n/a";
		return `${mark} ${shown}`;
	};
	const seconds = (ms) => `${(ms / 1000).toFixed(2)} s`;
	const millis = (ms) => `${Math.round(ms)} ms`;
	const kilobytes = (bytes) => `${(bytes / KB).toFixed(0)} KB`;
	const head = (label, max, format) => `${label} (≤ ${format(max)})`;
	const lines = rows.map(
		(row) =>
			`| \`${row.path}\` | ${cell(row.lcp, seconds)} | ${cell(row.tbt, millis)} | ${cell(row.cls, (v) => v.toFixed(3))} | ${cell(row.js, kilobytes)} | ${cell(row.total, kilobytes)} |`,
	);
	const warned = [
		...Object.entries(budgets),
		["total", [sizes.total.level]],
	].some(([, [level]]) => level === "warn");
	return [
		`| Page | ${head("LCP", budgets["largest-contentful-paint"][1].maxNumericValue, seconds)} | ${head("TBT", budgets["total-blocking-time"][1].maxNumericValue, millis)} | CLS (≤ ${budgets["cumulative-layout-shift"][1].maxNumericValue}) | ${head("JS", sizes.script.max, kilobytes)} | ${head("Total", sizes.total.max, kilobytes)} |`,
		"| --- | --- | --- | --- | --- | --- |",
		...lines,
		"",
		`Mobile profile: slow 4G, CPU 4x slower; timings are the median of 3 runs, weights are compressed bytes of the representative run. LCP and initial JS block the pull request${warned ? `; the others only warn (⚠️) until ${new Date(WARN_UNTIL).toISOString().slice(0, 10)}, then block` : "; the others block too"}.`,
	].join("\n");
}

module.exports = {
	assertions,
	sizeBudgets,
	config,
	pickUrls,
	evaluate,
	blockingFailures,
	renderReport,
	ChallengedError,
	MOBILE_SLOW_4G,
};
