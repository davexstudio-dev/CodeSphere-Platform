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

// The audits that fail a pull request from day one (LCP and initial JS), then the rest once the
// two-week warning period has passed. INP needs a real interaction, so the lab proxy is Total
// Blocking Time (the field value comes from #251).
const WARN_UNTIL = Date.parse("2026-11-02T00:00:00Z");

/**
 * `budgets` as lhci assertions. `now` is injectable for tests.
 * @param {number} [now]
 * @returns {Record<string, ["error" | "warn", { maxNumericValue: number }]>}
 */
function assertions(now = Date.now()) {
	const later = now >= WARN_UNTIL ? "error" : "warn";
	return {
		"largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
		"resource-summary:script:size": ["error", { maxNumericValue: 150 * KB }],
		"total-blocking-time": [later, { maxNumericValue: 200 }],
		"cumulative-layout-shift": [later, { maxNumericValue: 0.1 }],
		"resource-summary:total:size": [later, { maxNumericValue: 300 * KB }],
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
			assert: { assertions: assertions(now), includePassedAssertions: false },
			upload: { target: "filesystem", outputDir: ".lighthouseci" },
		},
	};
}

/**
 * The pages to audit: home (feed), ask form, and the first Question and Hackathon the preview
 * serves. `fetchJson` is injectable; a page whose data is missing is left out, not faked.
 * @param {string} origin
 * @param {(url: string) => Promise<any>} fetchJson
 * @returns {Promise<string[]>}
 */
async function pickUrls(origin, fetchJson) {
	const base = origin.replace(/\/$/, "");
	const urls = [`${base}/`, `${base}/ask`];
	const questions = await fetchJson(`${base}/api/v1/questions?limit=1`).catch(
		() => null,
	);
	const question = questions?.items?.[0]?.id;
	if (question) {
		urls.push(`${base}/questions/${encodeURIComponent(question)}`);
	}
	const hackathons = await fetchJson(`${base}/api/v1/hackathons?limit=1`).catch(
		() => null,
	);
	const hackathon = hackathons?.items?.[0]?.slug;
	if (hackathon) {
		urls.push(`${base}/hackathons/${encodeURIComponent(hackathon)}`);
	}
	return urls;
}

/**
 * Markdown table of the representative run of each page, for the job summary and the PR.
 * @param {{ url: string, audits: any }[]} runs
 * @param {number} [now]
 */
function renderReport(runs, now = Date.now()) {
	const budgets = assertions(now);
	const limit = (name) => budgets[name][1].maxNumericValue;
	const mark = (ok) => (ok ? "✅" : "❌");
	const rows = runs.map(({ url, audits }) => {
		const lcp = audits["largest-contentful-paint"].numericValue;
		const tbt = audits["total-blocking-time"].numericValue;
		const cls = audits["cumulative-layout-shift"].numericValue;
		const js = audits["resource-summary"].details.items.find(
			(item) => item.resourceType === "script",
		).transferSize;
		const total = audits["resource-summary"].details.items.find(
			(item) => item.resourceType === "total",
		).transferSize;
		const path = new URL(url).pathname;
		return `| \`${path}\` | ${mark(lcp <= limit("largest-contentful-paint"))} ${(lcp / 1000).toFixed(2)} s | ${mark(tbt <= limit("total-blocking-time"))} ${Math.round(tbt)} ms | ${mark(cls <= limit("cumulative-layout-shift"))} ${cls.toFixed(3)} | ${mark(js <= limit("resource-summary:script:size"))} ${(js / KB).toFixed(0)} KB | ${mark(total <= limit("resource-summary:total:size"))} ${(total / KB).toFixed(0)} KB |`;
	});
	return [
		"| Page | LCP (≤ 2.5 s) | TBT (≤ 200 ms) | CLS (≤ 0.1) | JS (≤ 150 KB) | Total (≤ 300 KB) |",
		"| --- | --- | --- | --- | --- | --- |",
		...rows,
		"",
		"Mobile profile: slow 4G, CPU 4x slower, median of 3 runs. LCP and initial JS block the pull request; the others warn until 2 Nov 2026, then block.",
	].join("\n");
}

module.exports = { assertions, config, pickUrls, renderReport, MOBILE_SLOW_4G };
