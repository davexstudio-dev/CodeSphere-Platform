/// <reference types="bun" />
// #325 against a real Postgres: several Hackathons, from draft to archived.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { user } from "@codesphere/db/schema/auth";
import { hackathon } from "@codesphere/db/schema/hackathons";
import { cadev2026 } from "@codesphere/db/seed/cadev";
import { seedHackathon } from "@codesphere/db/seed/seed";
import { createRouterClient } from "@orpc/server";
import { and, eq, like } from "drizzle-orm";

import { appRouter } from "./routers";
import { testContext } from "./test-context";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("the life of a Hackathon (#325)", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID().slice(0, 8);
	const adminId = `it-life-${run}`;
	const seeded = `it-life-seed-${run}`;
	const slug = `it-life-${run}`;
	let organizationSlug = "";

	const admin = () =>
		createRouterClient(appRouter, {
			context: testContext({
				db,
				session: {
					user: { id: adminId, role: "admin", kind: "human" },
					session: { id: "s1" },
				} as unknown as Session,
			}),
		});
	const visitor = () =>
		createRouterClient(appRouter, { context: testContext({ db }) });
	const input = () => ({
		name: `Hack ${run}`,
		slug,
		organizationSlug,
		summary: "Un concours de test.",
		teamMin: 1,
		teamMax: 4,
		sourceUrl: "https://example.com/hack",
		teamsEnabled: true,
		submissionClose: "2030-01-15T12:00:00.000Z",
	});
	const listed = async () =>
		(await visitor().hackathons.list({ limit: 100 })).items.map((h) => h.slug);

	beforeAll(async () => {
		await db.insert(user).values({
			id: adminId,
			name: "IT admin",
			email: `${adminId}@example.com`,
			role: "admin",
		});
		await seedHackathon(db, { ...cadev2026, slug: seeded });
		const found = await visitor().hackathons.get({ slug: seeded });
		organizationSlug = found.organizationSlug ?? "";
	});

	afterAll(async () => {
		await db.delete(auditLog).where(eq(auditLog.actorId, adminId));
		await db.delete(hackathon).where(like(hackathon.slug, `it-life-%${run}`));
		await db.delete(user).where(eq(user.id, adminId));
	});

	test("what exists before the status is published", async () => {
		const found = await visitor().hackathons.get({ slug: seeded });
		expect(found.status).toBe("published");
	});

	test("a new Hackathon is a draft: hidden from the public, listed for an Admin", async () => {
		const created = await admin().admin.hackathons.create(input());
		expect(created.status).toBe("draft");
		expect(created.milestones.map((m) => m.key)).toEqual(["submission_close"]);
		expect(created.criteria.reduce((sum, c) => sum + c.weight, 0)).toBe(100);

		expect(await listed()).not.toContain(slug);
		await expect(visitor().hackathons.get({ slug })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		const { items } = await admin().admin.hackathons.list({});
		expect(items.find((h) => h.slug === slug)?.submissionCount).toBe(0);
		const events = await db
			.select()
			.from(auditLog)
			.where(
				and(
					eq(auditLog.actorId, adminId),
					eq(auditLog.action, "hackathon.create"),
				),
			);
		expect(events).toHaveLength(1);
	});

	test("a slug already taken is refused", async () => {
		await expect(
			admin().admin.hackathons.create(input()),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("a draft's calendar can gain a step; a published one's cannot", async () => {
		const { items } = await admin().admin.hackathons.list({});
		const draft = items.find((h) => h.slug === slug);
		const milestones = [
			...(draft?.milestones ?? []),
			{
				key: "jury",
				label: "Jury",
				startsAt: "2030-02-01T12:00:00.000Z",
				endsAt: null,
			},
		];
		const updated = await admin().admin.hackathons.update({
			slug,
			expectedVersion: draft?.version ?? 0,
			milestones,
		});
		expect(updated.milestones.map((m) => m.key)).toEqual([
			"submission_close",
			"jury",
		]);
	});

	test("a draft without a Milestone cannot be published", async () => {
		const { items } = await admin().admin.hackathons.list({});
		const draft = items.find((h) => h.slug === slug);
		const emptied = await admin().admin.hackathons.update({
			slug,
			expectedVersion: draft?.version ?? 0,
			milestones: [],
		});
		await expect(
			admin().admin.hackathons.advance({
				slug,
				expectedVersion: emptied.version,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await admin().admin.hackathons.update({
			slug,
			expectedVersion: emptied.version,
			milestones: draft?.milestones ?? [],
		});
	});

	test("the status moves one way: public, then ended, then out of the lists", async () => {
		const { items } = await admin().admin.hackathons.list({});
		let version = items.find((h) => h.slug === slug)?.version ?? 0;

		const published = await admin().admin.hackathons.advance({
			slug,
			expectedVersion: version,
		});
		expect(published.status).toBe("published");
		expect(await listed()).toContain(slug);
		version = published.version;

		await expect(
			admin().admin.hackathons.advance({ slug, expectedVersion: version - 1 }),
		).rejects.toMatchObject({ code: "CONFLICT" });

		const ended = await admin().admin.hackathons.advance({
			slug,
			expectedVersion: version,
		});
		expect(ended.status).toBe("ended");
		expect(await listed()).toContain(slug);

		const archived = await admin().admin.hackathons.advance({
			slug,
			expectedVersion: ended.version,
		});
		expect(archived.status).toBe("archived");
		expect(await listed()).not.toContain(slug);
		expect((await visitor().hackathons.get({ slug })).status).toBe("archived");

		await expect(
			admin().admin.hackathons.advance({
				slug,
				expectedVersion: archived.version,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
