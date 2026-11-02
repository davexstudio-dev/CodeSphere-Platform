/// <reference types="bun" />
// Integration test of the Organization team (#326) against a real Postgres: invitations, the two
// roles, removal, the hand-over of the management and the succession when the owner deletes their
// account.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { user } from "@codesphere/db/schema/auth";
import {
	organization,
	organizationInvitation,
	organizationMember,
} from "@codesphere/db/schema/organizations";
import { createRouterClient } from "@orpc/server";
import { eq, inArray, like } from "drizzle-orm";

import { deleteMember } from "../members-delete";
import { appRouter } from "../routers";
import { testContext } from "../test-context";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Organization team on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID().slice(0, 8);
	const admin = `it-team-admin-${run}`;
	const owner = `it-team-owner-${run}`;
	const bea = `it-team-bea-${run}`;
	const carl = `it-team-carl-${run}`;
	const dana = `it-team-dana-${run}`;
	const bot = `it-team-bot-${run}`;
	const ids = [admin, owner, bea, carl, dana, bot];
	const as = (id: string, role = "member") =>
		createRouterClient(appRouter, {
			context: testContext({
				db,
				session: {
					user: { id: id, role, kind: "human" },
					session: { id: "s" },
				} as unknown as Session,
			}),
		});
	let orgId = "";

	const teamOf = async () =>
		await as(owner).organizations.team.get({ organizationId: orgId });
	const invite = async (who: string) => {
		const invitation = await as(owner).organizations.team.invite({
			organizationId: orgId,
			memberId: who,
		});
		await as(who).organizations.invitations.accept({
			invitationId: invitation.id,
		});
	};

	beforeAll(async () => {
		await db.insert(user).values([
			{
				id: admin,
				name: "Admin",
				email: `${admin}@example.com`,
				role: "admin",
			},
			{ id: owner, name: "Owner", email: `${owner}@example.com` },
			{ id: bea, name: "Bea", email: `${bea}@example.com` },
			{ id: carl, name: "Carl", email: `${carl}@example.com` },
			{ id: dana, name: "Dana", email: `${dana}@example.com` },
			{ id: bot, name: "Bot", email: `${bot}@example.com`, kind: "agent" },
		]);
		const [org] = await db
			.insert(organization)
			.values({
				slug: `team-org-${run}`,
				name: `Team Org ${run}`,
				website: `https://www.${run}.example.org`,
				country: "SN",
				contactEmail: `contact@${run}.example.org`,
				status: "validated",
				ownerId: owner,
				validatedAt: new Date(),
			})
			.returning({ id: organization.id });
		orgId = org?.id ?? "";
	});

	afterAll(async () => {
		await db
			.delete(organizationInvitation)
			.where(eq(organizationInvitation.organizationId, orgId));
		await db
			.delete(organizationMember)
			.where(eq(organizationMember.organizationId, orgId));
		await db.delete(auditLog).where(inArray(auditLog.actorId, ids));
		await db.delete(organization).where(like(organization.slug, `%${run}`));
		await db.delete(user).where(inArray(user.id, ids));
	});

	test("an editor cannot invite: the owner manages the team", async () => {
		await invite(bea);
		await expect(
			as(bea).organizations.team.invite({
				organizationId: orgId,
				memberId: carl,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("a stranger does not even see the team", async () => {
		await expect(
			as(carl).organizations.team.get({ organizationId: orgId }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("the invitee must accept, and an agent cannot be invited", async () => {
		const invitation = await as(owner).organizations.team.invite({
			organizationId: orgId,
			memberId: carl,
		});
		expect((await teamOf()).members.map((m) => m.memberId)).not.toContain(carl);
		expect(
			(await as(carl).organizations.invitations.mine({})).items.map(
				(i) => i.id,
			),
		).toContain(invitation.id);
		await expect(
			as(owner).organizations.team.invite({
				organizationId: orgId,
				memberId: bot,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			as(owner).organizations.team.invite({
				organizationId: orgId,
				memberId: carl,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await as(carl).organizations.invitations.decline({
			invitationId: invitation.id,
		});
		expect((await teamOf()).members.map((m) => m.memberId)).not.toContain(carl);
		await expect(
			as(carl).organizations.invitations.accept({
				invitationId: invitation.id,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	test("nobody answers an invitation addressed to someone else", async () => {
		const invitation = await as(owner).organizations.team.invite({
			organizationId: orgId,
			memberId: carl,
		});
		await expect(
			as(dana).organizations.invitations.accept({
				invitationId: invitation.id,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await as(owner).organizations.team.cancel({ invitationId: invitation.id });
	});

	test("an editor leaves; the owner cannot be removed", async () => {
		await as(bea).organizations.team.remove({
			organizationId: orgId,
			memberId: bea,
		});
		expect((await teamOf()).members.map((m) => m.memberId)).not.toContain(bea);
		await expect(
			as(owner).organizations.team.remove({
				organizationId: orgId,
				memberId: owner,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	test("the management is handed over to an editor who accepts", async () => {
		await invite(bea);
		await expect(
			as(owner).organizations.team.transfer({
				organizationId: orgId,
				memberId: dana,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		const offer = await as(owner).organizations.team.transfer({
			organizationId: orgId,
			memberId: bea,
		});
		expect(offer.role).toBe("owner");
		await as(bea).organizations.invitations.accept({ invitationId: offer.id });
		const team = await as(bea).organizations.team.get({
			organizationId: orgId,
		});
		expect(team.myRole).toBe("owner");
		expect(team.members.find((m) => m.memberId === owner)?.role).toBe("editor");
		const mine = await as(owner).organizations.mine({});
		expect(mine.items.find((o) => o.id === orgId)?.myRole).toBe("editor");
		const actions = (
			await db
				.select({ action: auditLog.action })
				.from(auditLog)
				.where(inArray(auditLog.actorId, ids))
		).map((a) => a.action);
		expect(actions).toContain("organization.transfer");
		expect(actions).toContain("organization.invitation_accept");
	});

	test("an Admin can remove an editor", async () => {
		await as(admin, "admin").admin.organizations.removeMember({
			organizationId: orgId,
			memberId: owner,
		});
		expect(
			(
				await as(bea).organizations.team.get({ organizationId: orgId })
			).members.map((m) => m.memberId),
		).not.toContain(owner);
	});

	test("when the owner deletes their account the longest-standing editor takes over", async () => {
		await as(bea)
			.organizations.team.invite({ organizationId: orgId, memberId: carl })
			.then((i) =>
				as(carl).organizations.invitations.accept({ invitationId: i.id }),
			);
		await deleteMember(db, bea, false);
		const [row] = await db
			.select({ ownerId: organization.ownerId, status: organization.status })
			.from(organization)
			.where(eq(organization.id, orgId));
		expect(row).toEqual({ ownerId: carl, status: "validated" });
		const rest = await db
			.select({ userId: organizationMember.userId })
			.from(organizationMember)
			.where(eq(organizationMember.organizationId, orgId));
		expect(rest).toEqual([]);
	});

	test("without an editor the Organization is left without an owner, not suspended", async () => {
		await deleteMember(db, carl, false);
		const [row] = await db
			.select({ ownerId: organization.ownerId, status: organization.status })
			.from(organization)
			.where(eq(organization.id, orgId));
		expect(row).toEqual({ ownerId: null, status: "validated" });
	});
	test("an Admin names an owner for an Organization left without one", async () => {
		await expect(
			as(admin, "admin").admin.organizations.assignOwner({
				organizationId: orgId,
				memberId: bot,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await as(admin, "admin").admin.organizations.assignOwner({
			organizationId: orgId,
			memberId: dana,
		});
		const [row] = await db
			.select({ ownerId: organization.ownerId })
			.from(organization)
			.where(eq(organization.id, orgId));
		expect(row?.ownerId).toBe(dana);
		// The seat is taken: a second naming is refused.
		await expect(
			as(admin, "admin").admin.organizations.assignOwner({
				organizationId: orgId,
				memberId: owner,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});
});
