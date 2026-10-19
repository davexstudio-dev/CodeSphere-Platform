/// <reference types="bun" />
// Integration test against a real Postgres (spec §5, #61). Runs only when TEST_DATABASE_URL
// points at a disposable database with the migrations applied (the CI integration job does both).
import { afterAll, describe, expect, test } from "bun:test";
import { createDb } from "@codesphere/db";
import { hackathon } from "@codesphere/db/schema/hackathons";
import { cadev2026 } from "@codesphere/db/seed/cadev";
import { seedHackathon } from "@codesphere/db/seed/seed";
import { createRouterClient } from "@orpc/server";
import { eq } from "drizzle-orm";

import { appRouter } from "./routers";
import { testContext } from "./test-context";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("CADEV seed and hackathons.get on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const slug = `it-cadev-${crypto.randomUUID()}`;
	const client = createRouterClient(appRouter, {
		context: testContext({ db }),
	});

	afterAll(async () => {
		await db.delete(hackathon).where(eq(hackathon.slug, slug));
	});

	test("replaying the seed creates the Hackathon once and keeps later edits", async () => {
		expect(await seedHackathon(db, { ...cadev2026, slug })).toBe("created");
		await db
			.update(hackathon)
			.set({ name: "Édité par un Admin" })
			.where(eq(hackathon.slug, slug));
		expect(await seedHackathon(db, { ...cadev2026, slug })).toBe("kept");
		const found = await client.hackathons.get({ slug });
		expect(found.name).toBe("Édité par un Admin");
		expect(found.milestones).toHaveLength(cadev2026.milestones.length);
	});

	test("serves the organisers' calendar and the criteria in order", async () => {
		const found = await client.hackathons.get({ slug });
		expect(found.milestones[0]).toMatchObject({
			key: "submission_close",
			startsAt: "2026-11-15T17:00:00.000Z",
		});
		expect(found.criteria.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
	});

	test("the CADEV does not run teams here: it registers on the organiser's site", async () => {
		const found = await client.hackathons.get({ slug });
		expect(found.teamsEnabled).toBe(false);
	});

	test("an unknown slug gets NOT_FOUND", async () => {
		await expect(
			client.hackathons.get({ slug: `${slug}-missing` }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
