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
import { hackathonTeams } from "@codesphere/db/schema/teams";
import { createRouterClient } from "@orpc/server";
import { and, eq, inArray, like } from "drizzle-orm";

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
	const admin = `it-oh-admin-${run}`;
	const ids = [owner, editor, stranger, bot, admin];
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
			{
				id: admin,
				name: "Admin",
				email: `${admin}@example.com`,
				role: "admin",
			},
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

	test("publishing needs the terms, which only the owner accepts", async () => {
		const created = await as(editor).organizations.hackathons.create(input());
		expect(created.status).toBe("draft");
		const advance = () =>
			as(editor).organizations.hackathons.advance({
				slug,
				expectedVersion: created.version,
			});
		await expect(advance()).rejects.toMatchObject({ code: "FORBIDDEN" });
		const terms = await as(editor).organizations.hackathons.terms.get({
			organizationId: orgId,
		});
		expect(terms.accepted).toBe(false);
		await expect(
			as(editor).organizations.hackathons.terms.accept({
				organizationId: orgId,
				version: terms.version,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			as(owner).organizations.hackathons.terms.accept({
				organizationId: orgId,
				version: "an-older-version",
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });

		const accepted = await as(owner).organizations.hackathons.terms.accept({
			organizationId: orgId,
			version: terms.version,
		});
		expect(accepted).toMatchObject({
			accepted: true,
			acceptedByName: "Owner",
		});
		// A second acceptance changes nothing and writes no second event.
		await as(owner).organizations.hackathons.terms.accept({
			organizationId: orgId,
			version: terms.version,
		});
		const events = await db
			.select({ id: auditLog.id })
			.from(auditLog)
			.where(
				and(
					eq(auditLog.action, "organization.terms_accept"),
					eq(auditLog.targetId, orgId),
				),
			);
		expect(events).toHaveLength(1);

		const published = await advance();
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

	test("the Hackathons of a suspended Organization leave the public views", async () => {
		const listed = async () =>
			(await visitor().hackathons.list({})).items.map((h) => h.slug);
		expect(await listed()).toContain(slug);
		await db
			.update(organization)
			.set({ status: "suspended" })
			.where(eq(organization.id, orgId));
		expect(await listed()).not.toContain(slug);
		await expect(visitor().hackathons.get({ slug })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		// An Admin still sees it.
		const { items } = await as(admin, "human", "admin").admin.hackathons.list(
			{},
		);
		expect(items.map((h) => h.slug)).toContain(slug);
		await db
			.update(organization)
			.set({ status: "validated" })
			.where(eq(organization.id, orgId));
		expect(await listed()).toContain(slug);
	});

	test("an Admin takes a published Hackathon back to a draft, with a reason", async () => {
		const staff = as(admin, "human", "admin");
		const [current] = await db
			.select({ version: hackathon.version })
			.from(hackathon)
			.where(eq(hackathon.slug, slug));
		await expect(
			staff.admin.hackathons.unpublish({
				slug,
				expectedVersion: (current?.version ?? 1) + 5,
				reason: "Contenu trompeur",
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		const draft = await staff.admin.hackathons.unpublish({
			slug,
			expectedVersion: current?.version ?? 1,
			reason: "Contenu trompeur",
		});
		expect(draft.status).toBe("draft");
		await expect(visitor().hackathons.get({ slug })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		const [event] = await db
			.select({ details: auditLog.details })
			.from(auditLog)
			.where(eq(auditLog.action, "hackathon.unpublish"));
		expect(event?.details).toMatchObject({ reason: "Contenu trompeur" });
		await expect(
			staff.admin.hackathons.unpublish({
				slug,
				expectedVersion: draft.version,
				reason: "Encore",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		// The unpublication holds: the Organization sees why and cannot publish again by itself.
		const { items } = await as(owner).organizations.hackathons.list({
			organizationId: orgId,
		});
		expect(items.find((h) => h.slug === slug)?.unpublishedReason).toBe(
			"Contenu trompeur",
		);
		await expect(
			as(editor).organizations.hackathons.advance({
				slug,
				expectedVersion: draft.version,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		// An Admin lifts the lock once the content is fixed; the terms stay accepted.
		const cleared = await staff.admin.hackathons.allowRepublication({
			slug,
			expectedVersion: draft.version,
		});
		expect(cleared.status).toBe("draft");
		await expect(
			staff.admin.hackathons.allowRepublication({
				slug,
				expectedVersion: cleared.version,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		const again = await as(editor).organizations.hackathons.advance({
			slug,
			expectedVersion: cleared.version,
		});
		expect(again.status).toBe("published");
	});

	describe("editing from the Organization space (#338)", () => {
		const editSlug = `oh-edit-${run}`;
		const versionOf = async () =>
			(
				await db
					.select({ version: hackathon.version })
					.from(hackathon)
					.where(eq(hackathon.slug, editSlug))
			)[0]?.version ?? 1;

		test("an editor sets the prizes, and the check date moves to now", async () => {
			const created = await as(editor).organizations.hackathons.create({
				...input(),
				slug: editSlug,
			});
			const before = Date.now();
			const updated = await as(editor).organizations.hackathons.update({
				slug: editSlug,
				expectedVersion: created.version,
				name: `Edited ${run}`,
				prizes: [
					{ label: "First", amount: "1000 EUR", conditions: null },
					{ label: "Second", amount: null, conditions: "Present on stage" },
				],
				verifiedAt: "2020-01-01T00:00:00.000Z",
			});
			expect(updated.name).toBe(`Edited ${run}`);
			expect(updated.prizes.map((p) => p.label)).toEqual(["First", "Second"]);
			// Whatever the Organization sends, the check date is the moment of its edit.
			expect(new Date(updated.verifiedAt).getTime()).toBeGreaterThanOrEqual(
				before - 1000,
			);
			await expect(
				as(editor).organizations.hackathons.update({
					slug: editSlug,
					expectedVersion: created.version,
					name: "Stale",
				}),
			).rejects.toMatchObject({ code: "CONFLICT" });
		});

		test("teams already formed hold teamsEnabled and teamMax in place", async () => {
			const [row] = await db
				.select({ id: hackathon.id })
				.from(hackathon)
				.where(eq(hackathon.slug, editSlug));
			const [team] = await db
				.insert(hackathonTeams)
				.values({
					hackathonId: row?.id ?? "",
					name: `Team ${run}`,
					captainId: owner,
					inviteToken: `tok-${run}`,
					memberCount: 3,
				})
				.returning({ id: hackathonTeams.id });
			await expect(
				as(editor).organizations.hackathons.update({
					slug: editSlug,
					expectedVersion: await versionOf(),
					teamsEnabled: false,
				}),
			).rejects.toMatchObject({
				code: "BAD_REQUEST",
				data: { issues: [{ path: ["teamsEnabled"] }] },
			});
			await expect(
				as(editor).organizations.hackathons.update({
					slug: editSlug,
					expectedVersion: await versionOf(),
					teamMax: 2,
				}),
			).rejects.toMatchObject({
				code: "BAD_REQUEST",
				data: { issues: [{ path: ["teamMax"] }] },
			});
			// Room for the largest team is fine, and the Admin has no such limit.
			const kept = await as(editor).organizations.hackathons.update({
				slug: editSlug,
				expectedVersion: await versionOf(),
				teamMax: 3,
			});
			expect(kept.teamMax).toBe(3);
			const freed = await as(admin, "human", "admin").admin.hackathons.update({
				slug: editSlug,
				expectedVersion: await versionOf(),
				teamsEnabled: false,
			});
			expect(freed.teamsEnabled).toBe(false);
			await db
				.delete(hackathonTeams)
				.where(eq(hackathonTeams.id, team?.id ?? ""));
		});

		test("an archived Hackathon is read-only for the Organization, not for an Admin", async () => {
			await db
				.update(hackathon)
				.set({ status: "archived" })
				.where(eq(hackathon.slug, editSlug));
			await expect(
				as(editor).organizations.hackathons.update({
					slug: editSlug,
					expectedVersion: await versionOf(),
					name: "Nope",
				}),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			const fixed = await as(admin, "human", "admin").admin.hackathons.update({
				slug: editSlug,
				expectedVersion: await versionOf(),
				name: `Fixed ${run}`,
			});
			expect(fixed.name).toBe(`Fixed ${run}`);
		});

		test("a Hackathon an Admin unpublished stays editable while locked", async () => {
			await db
				.update(hackathon)
				.set({ status: "published" })
				.where(eq(hackathon.slug, editSlug));
			const staff = as(admin, "human", "admin");
			const draft = await staff.admin.hackathons.unpublish({
				slug: editSlug,
				expectedVersion: await versionOf(),
				reason: "A corriger",
			});
			const { items } = await as(owner).organizations.hackathons.list({
				organizationId: orgId,
			});
			expect(items.find((h) => h.slug === editSlug)?.unpublishedReason).toBe(
				"A corriger",
			);
			const edited = await as(editor).organizations.hackathons.update({
				slug: editSlug,
				expectedVersion: draft.version,
				summary: "Corrected by the Organization.",
			});
			expect(edited.summary).toBe("Corrected by the Organization.");
			expect(edited.status).toBe("draft");
		});
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
