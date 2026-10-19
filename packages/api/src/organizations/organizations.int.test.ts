/// <reference types="bun" />
// Integration test of the Organizations (#257) against a real Postgres: application, validation,
// rejection, suspension, the audit trail and the link from a Hackathon.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { user } from "@codesphere/db/schema/auth";
import { hackathon } from "@codesphere/db/schema/hackathons";
import { organization } from "@codesphere/db/schema/organizations";
import { outboxEvents } from "@codesphere/db/schema/outbox";
import { cadev2026 } from "@codesphere/db/seed/cadev";
import { seedHackathon } from "@codesphere/db/seed/seed";
import { createRouterClient } from "@orpc/server";
import { eq, inArray, like, or } from "drizzle-orm";

import { appRouter } from "../routers";
import { testContext } from "../test-context";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("organizations on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID().slice(0, 8);
	const admin = `it-org-admin-${run}`;
	const alice = `it-org-alice-${run}`;
	const bot = `it-org-bot-${run}`;
	const ids = [admin, alice, bot];
	const as = (id: string, role = "member", kind = "human") =>
		createRouterClient(appRouter, {
			context: testContext({
				db,
				session: {
					user: { id, role, kind },
					session: { id: "s" },
				} as unknown as Session,
			}),
		});
	const anonymous = () =>
		createRouterClient(appRouter, { context: testContext({ db }) });
	const application = (name: string, host = `${run}.example.org`) => ({
		name,
		website: `https://www.${host}`,
		contactEmail: `contact@${host}`,
		country: "SN",
		description: "A test organization.",
	});
	const name = (suffix: string) => `Org ${suffix} ${run}`;

	beforeAll(async () => {
		await db.insert(user).values([
			{
				id: admin,
				name: "Org admin",
				email: `${admin}@example.com`,
				role: "admin",
			},
			{ id: alice, name: "Alice", email: `${alice}@example.com` },
			{
				id: bot,
				name: "Bot",
				email: `${bot}@example.com`,
				kind: "agent",
				ownerId: alice,
			},
		]);
	});

	afterAll(async () => {
		await db.delete(hackathon).where(like(hackathon.slug, `it-org-%${run}`));
		await db
			.delete(organization)
			.where(
				or(
					like(organization.slug, `%${run}%`),
					inArray(organization.ownerId, ids),
					inArray(organization.reviewedBy, ids),
				),
			);
		await db.delete(auditLog).where(inArray(auditLog.actorId, ids));
		await db.delete(user).where(inArray(user.id, [bot, alice, admin]));
	});

	test("an application is pending and invisible to the public until an Admin validates it", async () => {
		const created = await as(alice).organizations.request(
			application(name("a")),
		);
		expect(created).toMatchObject({ status: "pending", slug: `org-a-${run}` });
		await expect(
			anonymous().organizations.get({ slug: created.slug }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(
			(await as(alice).organizations.mine({})).items.map((o) => o.slug),
		).toContain(created.slug);

		const pending = await as(admin, "admin").admin.organizations.list({
			limit: 50,
			status: "pending",
		});
		const row = pending.items.find((o) => o.id === created.id);
		expect(row).toMatchObject({ ownerName: "Alice", version: 1 });

		const validated = await as(admin, "admin").admin.organizations.validate({
			id: created.id,
			expectedVersion: 1,
		});
		expect(validated).toMatchObject({ status: "validated", version: 2 });
		const profile = await anonymous().organizations.get({ slug: created.slug });
		expect(profile).toMatchObject({ name: name("a"), country: "SN" });
		expect(JSON.stringify(profile)).not.toContain("contact@");
		expect(
			(await anonymous().organizations.list({ limit: 50 })).items.map(
				(o) => o.slug,
			),
		).toContain(created.slug);
	});

	test("each application and decision leaves an event in the outbox, in the same statement", async () => {
		const created = await as(admin, "admin").organizations.request(
			application(name("ev")),
		);
		await as(admin, "admin").admin.organizations.validate({
			id: created.id,
			expectedVersion: 1,
		});
		const events = await db
			.select({ type: outboxEvents.type })
			.from(outboxEvents)
			.where(eq(outboxEvents.aggregateId, created.id));
		expect(events.map((e) => e.type).sort()).toEqual([
			"organization.applied",
			"organization.validated",
		]);
		await db
			.delete(outboxEvents)
			.where(eq(outboxEvents.aggregateId, created.id));
	});

	test("the contact email must be on the website's domain", async () => {
		await expect(
			as(alice).organizations.request({
				...application(name("b")),
				contactEmail: "someone@gmail.com",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			as(alice).organizations.request({
				...application(name("b")),
				contactEmail: "rh@elsewhere.com",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("an Agent and an anonymous visitor cannot apply; a name is taken once", async () => {
		await expect(
			as(bot, "member", "agent").organizations.request(application(name("c"))),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(
			anonymous().organizations.request(application(name("c"))),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		await expect(
			as(alice).organizations.request(application(name("a"))),
		).rejects.toMatchObject({
			code: "CONFLICT",
		});
	});

	test("a rejection carries its reason; a decision is taken once and a stale screen gets CONFLICT", async () => {
		const created = await as(alice).organizations.request(
			application(name("d")),
		);
		const staff = as(admin, "admin").admin.organizations;
		await expect(
			staff.reject({
				id: created.id,
				expectedVersion: 7,
				reason: "Not verifiable",
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		const rejected = await staff.reject({
			id: created.id,
			expectedVersion: 1,
			reason: "Not verifiable",
		});
		expect(rejected).toMatchObject({
			status: "rejected",
			statusReason: "Not verifiable",
		});
		await expect(
			staff.validate({ id: created.id, expectedVersion: 2 }),
		).rejects.toMatchObject({
			code: "CONFLICT",
		});
		await expect(
			staff.validate({ id: crypto.randomUUID(), expectedVersion: 1 }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		const mine = (await as(alice).organizations.mine({})).items.find(
			(o) => o.id === created.id,
		);
		expect(mine).toMatchObject({
			status: "rejected",
			statusReason: "Not verifiable",
		});
	});

	test("suspension hides the profile, reinstating brings it back; only staff decide", async () => {
		const created = await as(alice).organizations.request(
			application(name("e")),
		);
		const staff = as(admin, "admin").admin.organizations;
		await expect(
			as(alice).admin.organizations.validate({
				id: created.id,
				expectedVersion: 1,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			staff.suspend({ id: created.id, expectedVersion: 1, reason: "Abuse" }),
		).rejects.toMatchObject({
			code: "CONFLICT",
		});
		const v = await staff.validate({ id: created.id, expectedVersion: 1 });
		const suspended = await staff.suspend({
			id: created.id,
			expectedVersion: v.version,
			reason: "Abuse reported",
		});
		expect(suspended).toMatchObject({
			status: "suspended",
			statusReason: "Abuse reported",
		});
		await expect(
			anonymous().organizations.get({ slug: created.slug }),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		const back = await staff.reinstate({
			id: created.id,
			expectedVersion: suspended.version,
		});
		expect(back).toMatchObject({ status: "validated", statusReason: null });
		expect(
			(await anonymous().organizations.get({ slug: created.slug })).name,
		).toBe(name("e"));
	});

	test("a rejected name is free again, and the first validation date survives a suspension", async () => {
		const staff = as(admin, "admin").admin.organizations;
		const first = await as(alice).organizations.request(application(name("f")));
		await staff.reject({
			id: first.id,
			expectedVersion: 1,
			reason: "Missing details",
		});
		// Reapplying with the same name works: the rejected slug was released.
		const again = await as(alice).organizations.request(application(name("f")));
		expect(again.slug).toBe(first.slug);
		const v = await staff.validate({ id: again.id, expectedVersion: 1 });
		const date = (await anonymous().organizations.get({ slug: again.slug }))
			.validatedAt;
		expect(date).not.toBeNull();
		const s = await staff.suspend({
			id: again.id,
			expectedVersion: v.version,
			reason: "Pause",
		});
		await staff.reinstate({ id: again.id, expectedVersion: s.version });
		expect(
			(await anonymous().organizations.get({ slug: again.slug })).validatedAt,
		).toBe(date);
		// Open applications: the limit counts it (a, e, f here).
	});

	test("every decision is audited with its actor", async () => {
		const events = await db
			.select({ action: auditLog.action })
			.from(auditLog)
			.where(inArray(auditLog.actorId, [admin, alice]));
		const actions = events.map((e) => e.action);
		for (const expected of [
			"organization.apply",
			"organization.validate",
			"organization.reject",
			"organization.suspend",
			"organization.reinstate",
		]) {
			expect(actions).toContain(expected);
		}
	});

	test("a Member has at most three open applications", async () => {
		const carol = `it-org-carol-${run}`;
		await db
			.insert(user)
			.values({ id: carol, name: "Carol", email: `${carol}@example.com` });
		try {
			for (const n of ["x1", "x2", "x3"]) {
				await as(carol).organizations.request(application(name(n)));
			}
			await expect(
				as(carol).organizations.request(application(name("x4"))),
			).rejects.toMatchObject({
				code: "CONFLICT",
			});
		} finally {
			await db.delete(organization).where(eq(organization.ownerId, carol));
			await db.delete(auditLog).where(eq(auditLog.actorId, carol));
			await db.delete(user).where(eq(user.id, carol));
		}
	});

	test("a Hackathon is organized by a validated Organization", async () => {
		const slug = `it-org-hack-${run}`;
		await seedHackathon(db, { ...cadev2026, slug, organizer: name("h") });
		const erin = `it-org-erin-${run}`;
		await db
			.insert(user)
			.values({ id: erin, name: "Erin", email: `${erin}@example.com` });
		const staff = as(admin, "admin");
		const seeded = await anonymous().hackathons.get({ slug });
		expect(seeded).toMatchObject({
			organizer: name("h"),
			organizationSlug: `org-h-${run}`,
		});

		const pending = await as(erin).organizations.request(
			application(name("p")),
		);
		await expect(
			staff.admin.hackathons.update({
				slug,
				expectedVersion: seeded.version,
				organizationSlug: pending.slug,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		const ok = await as(erin).organizations.request(application(name("q")));
		await staff.admin.organizations.validate({ id: ok.id, expectedVersion: 1 });
		const updated = await staff.admin.hackathons.update({
			slug,
			expectedVersion: seeded.version,
			organizationSlug: ok.slug,
		});
		expect(updated).toMatchObject({
			organizer: name("q"),
			organizationSlug: ok.slug,
		});
	});
});
