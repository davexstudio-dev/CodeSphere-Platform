/// <reference types="bun" />
// Integration test against a real Postgres (spec §5, #62). Runs only when TEST_DATABASE_URL
// points at a disposable database with the migrations applied (the CI integration job does both).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { user } from "@codesphere/db/schema/auth";
import { hackathon } from "@codesphere/db/schema/hackathons";
import { cadev2026 } from "@codesphere/db/seed/cadev";
import { seedHackathon } from "@codesphere/db/seed/seed";
import { createRouterClient } from "@orpc/server";
import { and, eq } from "drizzle-orm";

import { appRouter } from "./routers";
import { testContext } from "./test-context";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("admin.hackathons.update on Postgres (#124)", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID();
	const adminId = `it-admin-${run}`;
	// A copy of the CADEV under its own slug, so the shared seed stays untouched.
	const slug = `it-cadev-${run}`;

	const clientAs = (role: string) =>
		createRouterClient(appRouter, {
			context: testContext({
				db,
				session: {
					user: { id: adminId, role, kind: "human" },
					session: { id: "s1" },
				} as unknown as Session,
			}),
		});
	const admin = () => clientAs("admin");

	beforeAll(async () => {
		await db.insert(user).values({
			id: adminId,
			name: "IT admin",
			email: `${adminId}@example.com`,
			role: "admin",
		});
		await seedHackathon(db, { ...cadev2026, slug });
	});

	afterAll(async () => {
		await db.delete(auditLog).where(eq(auditLog.actorId, adminId));
		await db.delete(hackathon).where(eq(hackathon.slug, slug));
		await db.delete(user).where(eq(user.id, adminId));
	});

	test("the seed carries the organisers' calendar", async () => {
		const found = await admin().hackathons.get({ slug });
		expect(found.milestones.map((m) => [m.key, m.startsAt, m.endsAt])).toEqual([
			["submission_close", "2026-11-15T17:00:00.000Z", null],
			["peer_vote", "2026-11-15T18:00:00.000Z", "2026-11-16T23:59:00.000Z"],
			["public_vote", "2026-11-17T00:00:00.000Z", "2026-11-20T23:59:00.000Z"],
			["jury", "2026-11-22T00:00:00.000Z", null],
		]);
	});

	test("an edit lands, bumps the version, and is read back by hackathons.get", async () => {
		const before = await admin().hackathons.get({ slug });
		const milestones = before.milestones.map((m) =>
			m.key === "submission_close"
				? { ...m, startsAt: "2026-11-16T17:00:00.000Z" }
				: m,
		);
		const updated = await admin().admin.hackathons.update({
			slug,
			expectedVersion: before.version,
			sourceNote: "Calendrier confirmé par les organisateurs le 13/10.",
			milestones,
			criteria: [
				{ label: "Qualité technique", weight: 60, scoredBy: "jury" },
				{ label: "Vote du public", weight: 40, scoredBy: "public" },
			],
		});
		expect(updated.version).toBe(before.version + 1);

		const read = await admin().hackathons.get({ slug });
		expect(read.sourceNote).toBe(
			"Calendrier confirmé par les organisateurs le 13/10.",
		);
		expect(read.milestones[0]?.startsAt).toBe("2026-11-16T17:00:00.000Z");
		expect(read.criteria.map((c) => c.weight)).toEqual([60, 40]);
		expect(read.prizes).toEqual(before.prizes);
	});

	test("writes hackathon.update and milestone.update with the changed fields", async () => {
		const events = await db
			.select()
			.from(auditLog)
			.where(eq(auditLog.actorId, adminId));
		const hackathonEvent = events.find((e) => e.action === "hackathon.update");
		expect(hackathonEvent?.details?.fields?.sort()).toEqual([
			"criteria",
			"sourceNote",
		]);
		const milestoneEvents = events.filter(
			(e) => e.action === "milestone.update",
		);
		expect(milestoneEvents).toHaveLength(1);
		expect(milestoneEvents[0]?.targetId).toBe(`${slug}:submission_close`);
		expect(milestoneEvents[0]?.details).toEqual({ fields: ["startsAt"] });
	});

	test("a stale expectedVersion gets CONFLICT and writes nothing", async () => {
		const current = await admin().hackathons.get({ slug });
		await expect(
			admin().admin.hackathons.update({
				slug,
				expectedVersion: current.version - 1,
				name: "Écrasé",
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		const after = await admin().hackathons.get({ slug });
		expect(after.name).toBe(current.name);
		const renames = await db
			.select()
			.from(auditLog)
			.where(
				and(
					eq(auditLog.actorId, adminId),
					eq(auditLog.action, "hackathon.update"),
				),
			);
		expect(renames).toHaveLength(1);
	});

	test("an unknown slug is NOT_FOUND", async () => {
		await expect(
			admin().admin.hackathons.update({
				slug: `nope-${run}`,
				expectedVersion: 1,
				name: "X",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("adding a Milestone key is refused", async () => {
		const current = await admin().hackathons.get({ slug });
		await expect(
			admin().admin.hackathons.update({
				slug,
				expectedVersion: current.version,
				milestones: [
					...current.milestones,
					{
						key: "results",
						label: "Résultats",
						startsAt: "2026-11-05T00:00:00.000Z",
						endsAt: null,
					},
				],
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("criteria that do not total 100 are refused", async () => {
		const current = await admin().hackathons.get({ slug });
		await expect(
			admin().admin.hackathons.update({
				slug,
				expectedVersion: current.version,
				criteria: [{ label: "Seul", weight: 90, scoredBy: "jury" }],
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("a Member gets FORBIDDEN", async () => {
		await expect(
			clientAs("member").admin.hackathons.update({
				slug,
				expectedVersion: 1,
				name: "X",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});
