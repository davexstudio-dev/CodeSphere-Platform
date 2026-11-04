/// <reference types="bun" />
// Integration test of the reports on Hackathons (#326) against a real Postgres: who may report,
// one report per Member, the Admin queue, and the two ways to close a report.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { user } from "@codesphere/db/schema/auth";
import { hackathon, hackathonReport } from "@codesphere/db/schema/hackathons";
import { organization } from "@codesphere/db/schema/organizations";
import { createRouterClient } from "@orpc/server";
import { eq, inArray, like } from "drizzle-orm";

import { appRouter } from "./routers";
import { testContext } from "./test-context";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Hackathon reports on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID().slice(0, 8);
	const ana = `it-hr-ana-${run}`;
	const ben = `it-hr-ben-${run}`;
	const cleo = `it-hr-cleo-${run}`;
	const bot = `it-hr-bot-${run}`;
	const admin = `it-hr-admin-${run}`;
	const ids = [ana, ben, cleo, bot, admin];
	const slug = `hr-hack-${run}`;
	const draftSlug = `hr-draft-${run}`;
	const as = (id: string, kind = "human", role = "member") =>
		createRouterClient(appRouter, {
			context: testContext({
				db,
				session: {
					user: { id, role, kind },
					session: { id: "s" },
				} as unknown as Session,
			}),
		});
	const visitor = () =>
		createRouterClient(appRouter, { context: testContext({ db }) });
	const staff = () => as(admin, "human", "admin");
	const queue = async () =>
		(await staff().admin.hackathons.reports({})).items.find(
			(h) => h.slug === slug,
		);
	let orgId = "";

	beforeAll(async () => {
		await db.insert(user).values([
			{ id: ana, name: "Ana", email: `${ana}@example.com` },
			{ id: ben, name: "Ben", email: `${ben}@example.com` },
			{ id: cleo, name: "Cleo", email: `${cleo}@example.com` },
			{ id: bot, name: "Bot", email: `${bot}@example.com`, kind: "agent" },
			{
				id: admin,
				name: "Admin",
				email: `${admin}@example.com`,
				role: "admin",
			},
		]);
		const [org] = await db
			.insert(organization)
			.values({
				slug: `hr-org-${run}`,
				name: `Report Org ${run}`,
				website: `https://www.${run}.example.org`,
				country: "SN",
				status: "validated",
				validatedAt: new Date(),
			})
			.returning({ id: organization.id });
		orgId = org?.id ?? "";
		const base = {
			organizationId: orgId,
			summary: "A Hackathon.",
			teamMin: 1,
			teamMax: 4,
			sourceUrl: "https://example.org/hack",
			verifiedAt: new Date(),
		};
		await db.insert(hackathon).values([
			{ ...base, slug, name: `Hack ${run}`, status: "published" },
			{ ...base, slug: draftSlug, name: `Draft ${run}`, status: "draft" },
		]);
	});

	afterAll(async () => {
		await db.delete(hackathon).where(like(hackathon.slug, `%${run}`));
		await db.delete(auditLog).where(inArray(auditLog.actorId, ids));
		await db.delete(organization).where(eq(organization.id, orgId));
		await db.delete(user).where(inArray(user.id, ids));
	});

	test("only a signed-in Member reports, and only a Hackathon the public can see", async () => {
		const report = { slug, reason: "misleading" as const };
		await expect(visitor().hackathons.report(report)).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		await expect(
			as(bot, "agent").hackathons.report(report),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			as(ana).hackathons.report({ ...report, slug: `nope-${run}` }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			as(ana).hackathons.report({ ...report, slug: draftSlug }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("a Member has one report per Hackathon; sending it again edits it", async () => {
		await as(ana).hackathons.report({ slug, reason: "misleading" });
		await as(ana).hackathons.report({
			slug,
			reason: "scam",
			comment: "Frais d'inscription cachés",
		});
		await as(ben).hackathons.report({ slug, reason: "spam" });
		const entry = await queue();
		expect(entry?.reports).toHaveLength(2);
		expect(entry?.reports).toContainEqual({
			reason: "scam",
			comment: "Frais d'inscription cachés",
		});
	});

	test("the queue is for staff", async () => {
		await expect(as(ana).admin.hackathons.reports({})).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	test("dismissing closes the reports and keeps the Hackathon; a dismissed report stays dismissed", async () => {
		await staff().admin.hackathons.dismissReports({ slug });
		expect(await queue()).toBeUndefined();
		const [row] = await db
			.select({ status: hackathon.status })
			.from(hackathon)
			.where(eq(hackathon.slug, slug));
		expect(row?.status).toBe("published");
		await as(ana).hackathons.report({ slug, reason: "unlawful" });
		expect(await queue()).toBeUndefined();
		await expect(
			staff().admin.hackathons.dismissReports({ slug }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		const events = await db
			.select({ id: auditLog.id })
			.from(auditLog)
			.where(eq(auditLog.action, "hackathon.reports_dismiss"));
		expect(events.length).toBeGreaterThanOrEqual(1);
	});

	test("unpublishing founds the waiting reports and locks the Hackathon", async () => {
		await as(cleo).hackathons.report({ slug, reason: "scam" });
		expect((await queue())?.reports).toHaveLength(1);
		const [current] = await db
			.select({ version: hackathon.version })
			.from(hackathon)
			.where(eq(hackathon.slug, slug));
		const draft = await staff().admin.hackathons.unpublish({
			slug,
			expectedVersion: current?.version ?? 1,
			reason: "Frais cachés",
		});
		expect(draft.status).toBe("draft");
		expect(await queue()).toBeUndefined();
		const outcomes = await db
			.select({
				userId: hackathonReport.userId,
				outcome: hackathonReport.outcome,
			})
			.from(hackathonReport);
		const mine = outcomes.filter((o) => ids.includes(o.userId));
		expect(mine.find((o) => o.userId === cleo)?.outcome).toBe("upheld");
		// The earlier, dismissed ones stay dismissed.
		expect(mine.find((o) => o.userId === ben)?.outcome).toBe("dismissed");
	});
});
