/// <reference types="bun" />
// Integration test against a real Postgres (spec §5, #122): the mutation and its audit event are
// ONE statement (a data-modifying CTE), so the edge driver's lack of transactions does not matter.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { user } from "@codesphere/db/schema/auth";
import { hackathon } from "@codesphere/db/schema/hackathons";
import { organization } from "@codesphere/db/schema/organizations";
import { eq, inArray } from "drizzle-orm";

import { withAudit } from "./audit";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("withAudit on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const id = crypto.randomUUID();
	const actorId = `it-audit-${id}`;
	const slug = `it-audit-${id}`;
	const other = `it-audit-other-${id}`;

	const base = {
		name: "Audit test",
		summary: "Test",
		teamMin: 1,
		teamMax: 2,
		sourceUrl: "https://example.com",
		verifiedAt: new Date(),
	};
	const eventsFor = (action: string) =>
		db.select().from(auditLog).where(eq(auditLog.action, action));

	let organizationId = "";

	beforeAll(async () => {
		const [org] = await db
			.insert(organization)
			.values({
				slug: `it-audit-org-${id}`,
				name: "Audit org",
				website: "https://example.com",
				country: "OTHER",
				status: "validated",
				system: true,
			})
			.returning({ id: organization.id });
		organizationId = org?.id ?? "";
		await db.insert(user).values({
			id: actorId,
			name: "Audit admin",
			email: `${actorId}@example.com`,
			role: "admin",
		});
		await db.insert(hackathon).values([
			{ ...base, organizationId, slug },
			{ ...base, organizationId, slug: other },
		]);
	});

	afterAll(async () => {
		await db.delete(auditLog).where(eq(auditLog.actorId, actorId));
		await db.delete(hackathon).where(eq(hackathon.slug, slug));
		await db.delete(hackathon).where(eq(hackathon.slug, other));
		await db.delete(user).where(eq(user.id, actorId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});

	test("a successful mutation writes exactly one audit event", async () => {
		const rows = await withAudit(
			db,
			{
				actorId,
				action: "it.audit.ok",
				targetType: "hackathon",
				details: { fields: ["name"] },
				targetIdColumn: "slug",
			},
			db
				.update(hackathon)
				.set({ name: "Renamed" })
				.where(eq(hackathon.slug, slug))
				.returning({ slug: hackathon.slug }),
		);
		expect(rows).toEqual([{ slug }]);
		const events = await eventsFor("it.audit.ok");
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			actorId,
			targetType: "hackathon",
			targetId: slug,
			details: { fields: ["name"] },
		});
	});

	test("a mutation that matches nothing writes no event", async () => {
		const rows = await withAudit(
			db,
			{ actorId, action: "it.audit.none", targetType: "hackathon" },
			db
				.update(hackathon)
				.set({ name: "Nobody" })
				.where(eq(hackathon.slug, `${slug}-missing`))
				.returning({ slug: hackathon.slug }),
		);
		expect(rows).toEqual([]);
		expect(await eventsFor("it.audit.none")).toHaveLength(0);
	});

	test("a failing mutation writes no event and changes nothing", async () => {
		await expect(
			withAudit(
				db,
				{ actorId, action: "it.audit.fail", targetType: "hackathon" },
				// slug is unique: renaming onto another row's slug violates the constraint.
				db
					.update(hackathon)
					.set({ slug: other })
					.where(eq(hackathon.slug, slug))
					.returning({ slug: hackathon.slug }),
			),
		).rejects.toThrow();
		expect(await eventsFor("it.audit.fail")).toHaveLength(0);
		const [row] = await db
			.select({ name: hackathon.name })
			.from(hackathon)
			.where(eq(hackathon.slug, slug));
		expect(row?.name).toBe("Renamed");
	});

	test("a mutation touching several rows is rejected and changes nothing", async () => {
		await expect(
			withAudit(
				db,
				{ actorId, action: "it.audit.multi", targetType: "hackathon" },
				db
					.update(hackathon)
					.set({ name: "Bulk" })
					.where(inArray(hackathon.slug, [slug, other]))
					.returning({ slug: hackathon.slug }),
			),
		).rejects.toMatchObject({
			cause: {
				code: "22P02",
				message: expect.stringContaining("one target per mutation"),
			},
		});
		expect(await eventsFor("it.audit.multi")).toHaveLength(0);
		const rows = await db
			.select({ slug: hackathon.slug, name: hackathon.name })
			.from(hackathon)
			.where(inArray(hackathon.slug, [slug, other]));
		expect(rows.map((r) => r.name).sort()).toEqual(["Audit test", "Renamed"]);
	});
});
