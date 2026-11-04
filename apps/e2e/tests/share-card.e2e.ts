import { expect, test } from "@playwright/test";

import { seedOpenHackathon } from "../support/hackathon";

// The share cards (#262, ADR 0001): what a crawler fetches when a link is pasted on a network.
// Under `next start` on Node, next/og cannot rasterize (the repo stubs sharp) and the routes serve
// the static card: either way the answer is a 1200x630 PNG, which is what these tests hold to.
// The dynamic drawing itself is checked on the Worker (staging), by eye.
const QUESTION_ID = "00000000-0000-4000-8000-000000000002";
const UNKNOWN_ID = "00000000-0000-4000-8000-0000000000ff";
const HACKATHON = "e2e-share-card";

/** Width and height from the IHDR chunk of a PNG, or null when the bytes are not a PNG. */
function pngSize(bytes: Buffer): { width: number; height: number } | null {
	const signature = "89504e470d0a1a0a";
	if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== signature) {
		return null;
	}
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test.beforeAll(async () => {
	await seedOpenHackathon(HACKATHON, "Hackathon de test des cartes");
});

for (const [label, path] of [
	["a Question", `/og/questions/${QUESTION_ID}`],
	["a Hackathon", `/og/hackathons/${HACKATHON}`],
	["an unknown Question", `/og/questions/${UNKNOWN_ID}`],
	["a Question id that is no id", "/og/questions/nope"],
	["an unknown Hackathon", "/og/hackathons/does-not-exist"],
] as const) {
	test(`the card of ${label} is a 1200x630 image`, async ({ request }) => {
		const response = await request.get(path);
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toContain("image/png");
		expect(pngSize(await response.body())).toEqual({
			width: 1200,
			height: 630,
		});
	});
}

test("a Question page points crawlers at its own card", async ({
	request,
	baseURL,
}) => {
	const html = await (await request.get(`/questions/${QUESTION_ID}`)).text();
	const meta = (key: string) =>
		new RegExp(
			`<meta[^>]+(?:property|name)="${key}"[^>]+content="([^"]*)"`,
		).exec(html)?.[1];
	const card = `${baseURL}/og/questions/${QUESTION_ID}`;
	expect(meta("og:image")).toBe(card);
	expect(meta("twitter:image")).toBe(card);
	expect(meta("twitter:card")).toBe("summary_large_image");
	expect(meta("og:title")).toBeTruthy();
	expect(html).toContain(
		`<link rel="canonical" href="${baseURL}/questions/${QUESTION_ID}"`,
	);
});

test("a Hackathon page points crawlers at its own card", async ({
	request,
	baseURL,
}) => {
	const html = await (await request.get(`/hackathons/${HACKATHON}`)).text();
	expect(html).toContain(`${baseURL}/og/hackathons/${HACKATHON}`);
	expect(html).toContain("summary_large_image");
});
