/// <reference types="bun" />
// POST /api/v1/vitals: the Web Vitals beacon (#251), against Postgres.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "@codesphere/db";
import { webVitals } from "@codesphere/db/schema/vitals";
import { createLogger } from "@codesphere/logger";
import { and, eq, sql } from "drizzle-orm";

import { createApp } from "./app";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Web Vitals beacon", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	// Two letters, as a country code is: one fixed, one random, so runs do not meet.
	const country = `V${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;
	const app = createApp({
		auth: { api: { getSession: async () => null } } as never,
		db,
		logger: createLogger({ level: "silent" }),
		corsOrigin: "http://localhost:3001",
		trustProxy: false,
		release: { version: "test", commit: "test" },
		apiDocs: false,
	});
	const post = (body: string, headers: Record<string, string> = {}) =>
		app.request("/api/v1/vitals", {
			method: "POST",
			// What sendBeacon sends: text/plain, so no preflight.
			headers: { "content-type": "text/plain;charset=UTF-8", ...headers },
			body,
		});
	const stored = () =>
		db.select().from(webVitals).where(eq(webVitals.country, country));

	beforeAll(async () => {
		await db.delete(webVitals).where(eq(webVitals.country, country));
	});
	afterAll(async () => {
		await db.delete(webVitals).where(eq(webVitals.country, country));
	});

	test("counts a report under the country Cloudflare names, with no cookie and no session", async () => {
		const response = await post(JSON.stringify({ name: "LCP", value: 1800 }), {
			"cf-ipcountry": country,
		});
		expect(response.status).toBe(204);
		expect(response.headers.get("set-cookie")).toBeNull();
		const rows = await stored();
		expect(rows).toMatchObject([{ metric: "LCP", samples: 1 }]);
		await post(JSON.stringify({ name: "LCP", value: 1900 }), {
			"cf-ipcountry": country,
		});
		expect((await stored())[0]?.samples).toBe(2);
	});

	test("never stores the client's address or anything it sent besides name and value", async () => {
		await post(
			JSON.stringify({
				name: "INP",
				value: 120,
				url: "https://x/y?token=abc",
				id: "visit-1",
			}),
			{
				"cf-ipcountry": country,
				"x-forwarded-for": "203.0.113.9",
				cookie: "session=secret",
			},
		);
		const text = JSON.stringify(await stored());
		expect(text).not.toContain("203.0.113");
		expect(text).not.toContain("secret");
		expect(text).not.toContain("token");
		expect(text).not.toContain("visit-1");
	});

	test("refuses what is not a Web Vital report", async () => {
		expect((await post("not json")).status).toBe(400);
		expect((await post(JSON.stringify({ name: "FID", value: 1 }))).status).toBe(
			400,
		);
		expect(
			(await post(JSON.stringify({ name: "LCP", value: -5 }))).status,
		).toBe(400);
		expect(
			(await post(JSON.stringify({ name: "LCP", value: 1e12 }))).status,
		).toBe(400);
		expect(
			(await post(JSON.stringify({ name: "LCP", value: "fast" }))).status,
		).toBe(400);
		expect((await post("x".repeat(600))).status).toBe(413);
		// The cap is in bytes: 300 two-byte characters are 600 bytes, though only 300 characters.
		expect((await post("é".repeat(300))).status).toBe(413);
	});

	test("a request without a country is counted under XX", async () => {
		const xx = () =>
			db
				.select()
				.from(webVitals)
				.where(and(eq(webVitals.country, "XX"), eq(webVitals.metric, "TTFB")));
		const total = (rows: Awaited<ReturnType<typeof xx>>) =>
			rows.reduce((sum, r) => sum + r.samples, 0);
		const before = total(await xx());
		await post(JSON.stringify({ name: "TTFB", value: 300 }));
		expect(total(await xx())).toBe(before + 1);
		// Put the shared XX bucket back as it was: take back the one sample this test added.
		await db
			.update(webVitals)
			.set({ samples: sql`${webVitals.samples} - 1` })
			.where(
				and(
					eq(webVitals.country, "XX"),
					eq(webVitals.metric, "TTFB"),
					eq(webVitals.bucket, 1),
				),
			);
		await db
			.delete(webVitals)
			.where(and(eq(webVitals.samples, 0), eq(webVitals.country, "XX")));
	});
});
