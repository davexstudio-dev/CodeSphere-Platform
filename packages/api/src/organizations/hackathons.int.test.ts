/// <reference types="bun" />
// Integration test of the Hackathons an Organization's team runs without an Admin (#326): who may,
// what they may not, and that it all lands in the audit log.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { user } from "@codesphere/db/schema/auth";
import { hackathon } from "@codesphere/db/schema/hackathons";
import {
	organization,
	organizationMember,
} from "@codesphere/db/schema/organizations";
import { createRouterClient } from "@orpc/server";
import { eq, inArray, like } from "drizzle-orm";

import { appRouter } from "../routers";
import { testContext } from "../test-context";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Organization Hackathons on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID().slice(0, 8);
	const owner = `it-oh-owner-${run}`;
	const editor = `it-oh-editor-${run}`;
	const stranger = `it-oh-stranger-${run}`;
	const bot = `it-oh-bot-${run}`;
	const ids = [owner, editor, stranger, bot];
	const as = (id: string, kind = "human") =>
		createRouterClient(appRouter, {
			context: testContext({
				db,
				session: {
					user: { id, role: "member", kind },
					session: { id: "s" },
				} as unknown as Session,
			}),
		});
	const orgSlug = `oh-org-${run}`;
	const slug = `oh-hack-${run}`;
	let orgId = "";
	let otherOrgSlug = "";

	const input = () => ({
		name: `Hack ${run}`,
		slug,
		organizationSlug: orgSlug,
		summary: "A Hackathon run by an Organization.",
		teamMin: 1,
		teamMax: 4,
		sourceUrl: "https://example.org/hack",
		teamsEnabled: true,
		submissionClose: "2031-01-01T12:00:00.000Z",
	});

	beforeAll(async () => {
		await db.insert(user).values([
			{ id: owner, name: "Owner", email: `${owner}@example.com` },
			{ id: editor, name: "Editor", email: `${editor}@example.com` },
			{ id: stranger, name: "Stranger", email: `${stranger}@example.com` },
			{ id: bot, name: "Bot", email: `${bot}@example.com`, kind: "agent" },
		]);
		const base = {
			website: `https://www.${run}.example.org`,
			country: "SN",
			contactEmail: `contact@${run}.example.org`,
			status: "validated" as const,
			validatedAt: new Date(),
		};
		const [org, other] = await db
			.insert(organization)
			.values([
				{ ...base, slug: orgSlug, name: `Org ${run}`, ownerId: owner },
				{
					...base,
					slug: `oh-other-${run}`,
					name: `Other ${run}`,
					ownerId: stranger,
				},
			])
			.returning({ id: organization.id, slug: organization.slug });
		orgId = org?.id ?? "";
		otherOrgSlug = other?.slug ?? "";
		await db
			.insert(organizationMember)
			.values({ organizationId: orgId, userId: editor });
	});

	afterAll(async () => {
		await db.delete(hackathon).where(like(hackathon.slug, `%${run}`));
		await db.delete(auditLog).where(inArray(auditLog.actorId, ids));
		await db
			.delete(organizationMember)
			.where(eq(organizationMember.organizationId, orgId));
		await db.delete(organization).where(like(organization.slug, `%${run}`));
		await db.delete(user).where(inArray(user.id, ids));
	});

	test("an editor creates a draft and publishes it without an Admin", async () => {
		const created = await as(editor).organizations.hackathons.create(input());
		expect(created.status).toBe("draft");
		const published = await as(editor).organizations.hackathons.advance({
			slug,
			expectedVersion: created.version,
		});
		expect(published.status).toBe("published");
		const actions = (
			await db
				.select({ action: auditLog.action })
				.from(auditLog)
				.where(eq(auditLog.actorId, editor))
		).map((a) => a.action);
		expect(actions).toContain("hackathon.status");
	});

	test("the owner sees the Organization's Hackathons", async () => {
		const { items } = await as(owner).organizations.hackathons.list({
			organizationId: orgId,
		});
		expect(items.map((h) => h.slug)).toEqual([slug]);
	});

	test("a stranger finds nothing: not the list, not the Hackathon", async () => {
		await expect(
			as(stranger).organizations.hackathons.list({ organizationId: orgId }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			as(stranger).organizations.hackathons.update({
				slug,
				expectedVersion: 1,
				name: "Mine now",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			as(stranger).organizations.hackathons.create({
				...input(),
				slug: `oh-nope-${run}`,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("an Agent never runs a Hackathon", async () => {
		await expect(
			as(bot, "agent").organizations.hackathons.list({ organizationId: orgId }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("the organizer cannot be changed from here", async () => {
		const [current] = await db
			.select({ version: hackathon.version })
			.from(hackathon)
			.where(eq(hackathon.slug, slug));
		await expect(
			as(editor).organizations.hackathons.update({
				slug,
				expectedVersion: current?.version ?? 1,
				organizationSlug: otherOrgSlug,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("the CADEV's Organization, created by the platform, stays with the Admins", async () => {
		await db
			.update(organization)
			.set({ system: true })
			.where(eq(organization.id, orgId));
		await expect(
			as(owner).organizations.hackathons.list({ organizationId: orgId }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await db
			.update(organization)
			.set({ system: false, status: "suspended" })
			.where(eq(organization.id, orgId));
		await expect(
			as(owner).organizations.hackathons.advance({ slug, expectedVersion: 1 }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
