/// <reference types="bun" />
// Integration test against a real Postgres (#286): staff invitations. Runs only when
// TEST_DATABASE_URL points at a disposable database with the schema pushed (the CI job does both).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { acceptStaffInvitation } from "@codesphere/auth/staff-invitation";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { user } from "@codesphere/db/schema/auth";
import { staffInvitation } from "@codesphere/db/schema/staff";
import { createRouterClient } from "@orpc/server";
import { and, eq, inArray, like } from "drizzle-orm";

import { appRouter } from "./routers";
import { testContext } from "./test-context";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("staff invitations on Postgres (#286)", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID().slice(0, 8);
	const adminId = `it-inv-admin-${run}`;
	const moderatorId = `it-inv-mod-${run}`;
	const memberId = `it-inv-member-${run}`;
	const email = (name: string) => `it-inv-${name}-${run}@example.com`;
	const sent: { email: string; role: string }[] = [];

	const clientAs = (id: string, role: string) =>
		createRouterClient(appRouter, {
			context: testContext({
				db,
				session: {
					user: { id, role, kind: "human", name: `Name ${id}` },
					session: { id: "s1" },
				} as unknown as Session,
				notifications: {
					apiKeyCreated: async () => {},
					agentPaused: async () => {},
					staffInvited: async (invitation) => {
						sent.push({ email: invitation.email, role: invitation.role });
						return true;
					},
				},
			}),
		});

	beforeAll(async () => {
		await db.insert(user).values([
			{
				id: adminId,
				name: "Inv admin",
				email: email("admin"),
				emailVerified: true,
				role: "admin",
			},
			{
				id: moderatorId,
				name: "Inv moderator",
				email: email("mod"),
				emailVerified: true,
				role: "moderator",
			},
			{
				id: memberId,
				name: "Inv member",
				email: email("member"),
				emailVerified: true,
				role: "member",
			},
		]);
	});

	afterAll(async () => {
		await db
			.delete(staffInvitation)
			.where(like(staffInvitation.email, `it-inv-%-${run}@example.com`));
		await db
			.delete(auditLog)
			.where(inArray(auditLog.actorId, [adminId, memberId]));
		await db.delete(user).where(like(user.id, `it-inv-%-${run}`));
	});

	test("an admin invites several emails; each gets an open offer and an email", async () => {
		const out = await clientAs(adminId, "admin").admin.staff.invite({
			emails: [email("new1"), email("new2"), email("new1")],
			role: "moderator",
		});
		expect(out.results.map((r) => r.status)).toEqual(["invited", "invited"]);
		expect(out.results.every((r) => r.emailSent)).toBe(true);
		expect(sent.map((s) => s.email)).toEqual([email("new1"), email("new2")]);

		const list = await clientAs(adminId, "admin").admin.staff.list();
		expect(list.invitations.map((i) => i.email)).toEqual(
			expect.arrayContaining([email("new1"), email("new2")]),
		);
	});

	test("the audit row carries the invitation id and the role, never the email", async () => {
		const rows = await db
			.select()
			.from(auditLog)
			.where(
				and(eq(auditLog.actorId, adminId), eq(auditLog.action, "staff.invite")),
			);
		expect(rows.length).toBeGreaterThanOrEqual(2);
		for (const row of rows) {
			expect(row.targetType).toBe("staff_invitation");
			expect(row.details).toEqual({ to: "moderator" });
			expect(JSON.stringify(row)).not.toContain("@example.com");
		}
	});

	test("inviting again replaces the open offer instead of piling up", async () => {
		await clientAs(adminId, "admin").admin.staff.invite({
			emails: [email("new1")],
			role: "admin",
		});
		const open = await db
			.select()
			.from(staffInvitation)
			.where(eq(staffInvitation.email, email("new1")));
		expect(
			open.filter((row) => !row.revokedAt && !row.acceptedAt),
		).toHaveLength(1);
		expect(open.find((row) => !row.revokedAt)?.role).toBe("admin");
	});

	test("an email that already belongs to a verified Member promotes them at once", async () => {
		const out = await clientAs(adminId, "admin").admin.staff.invite({
			emails: [email("member")],
			role: "moderator",
		});
		expect(out.results[0]?.status).toBe("promoted");
		const [row] = await db.select().from(user).where(eq(user.id, memberId));
		expect(row?.role).toBe("moderator");
		// Back to a plain member for the next tests.
		await db.update(user).set({ role: "member" }).where(eq(user.id, memberId));
	});

	test("someone already at this rank or above is reported, not changed", async () => {
		const out = await clientAs(adminId, "admin").admin.staff.invite({
			emails: [email("mod")],
			role: "moderator",
		});
		expect(out.results[0]?.status).toBe("already_staff");
	});

	test("a moderator cannot invite", async () => {
		await expect(
			clientAs(moderatorId, "moderator").admin.staff.invite({
				emails: [email("x")],
				role: "moderator",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			clientAs(moderatorId, "moderator").admin.staff.list(),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("super admin is not an invitable role", async () => {
		await expect(
			clientAs(adminId, "admin").admin.staff.invite({
				emails: [email("x")],
				// @ts-expect-error: the contract refuses it
				role: "super_admin",
			}),
		).rejects.toBeDefined();
	});

	test("an offer can be revoked, and only once", async () => {
		const { results } = await clientAs(adminId, "admin").admin.staff.invite({
			emails: [email("gone")],
			role: "moderator",
		});
		const id = results[0]?.invitationId ?? "";
		await clientAs(adminId, "admin").admin.staff.revokeInvitation({ id });
		await expect(
			clientAs(adminId, "admin").admin.staff.revokeInvitation({ id }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		const list = await clientAs(adminId, "admin").admin.staff.list();
		expect(list.invitations.some((i) => i.id === id)).toBe(false);
	});

	test("resending opens the offer for seven more days and sends the email again", async () => {
		const { results } = await clientAs(adminId, "admin").admin.staff.invite({
			emails: [email("again")],
			role: "moderator",
		});
		const id = results[0]?.invitationId ?? "";
		const before = sent.length;
		await db
			.update(staffInvitation)
			.set({ expiresAt: new Date(Date.now() + 1000) })
			.where(eq(staffInvitation.id, id));
		const out = await clientAs(adminId, "admin").admin.staff.resendInvitation({
			id,
		});
		expect(out.emailSent).toBe(true);
		expect(sent.length).toBe(before + 1);
		expect(Date.parse(out.invitation.expiresAt)).toBeGreaterThan(
			Date.now() + 6 * 24 * 60 * 60 * 1000,
		);
	});
});

describe.skipIf(!url)("accepting an invitation at sign-in (#286)", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID().slice(0, 8);
	const inviterId = `it-acc-inviter-${run}`;
	const email = (name: string) => `it-acc-${name}-${run}@example.com`;
	const ids: string[] = [inviterId];

	const makeMember = async (name: string, role: "member" | "moderator") => {
		const id = `it-acc-${name}-${run}`;
		ids.push(id);
		await db.insert(user).values({
			id,
			name,
			email: email(name),
			emailVerified: true,
			role,
		});
		return { id, email: email(name), role };
	};
	const offer = (
		name: string,
		role: "moderator" | "admin",
		over: Partial<typeof staffInvitation.$inferInsert> = {},
	) =>
		db.insert(staffInvitation).values({
			email: email(name),
			role,
			invitedBy: inviterId,
			expiresAt: new Date(Date.now() + 60_000),
			...over,
		});

	beforeAll(async () => {
		await db.insert(user).values({
			id: inviterId,
			name: "Inviter",
			email: email("inviter"),
			emailVerified: true,
			role: "admin",
		});
	});

	afterAll(async () => {
		await db
			.delete(staffInvitation)
			.where(like(staffInvitation.email, `it-acc-%-${run}@example.com`));
		await db.delete(auditLog).where(inArray(auditLog.actorId, ids));
		await db.delete(user).where(inArray(user.id, ids));
	});

	test("raises the role, closes the offer and audits it, once", async () => {
		const member = await makeMember("first", "member");
		await offer("first", "admin");
		expect(await acceptStaffInvitation(db, member)).toBe("admin");
		const [row] = await db.select().from(user).where(eq(user.id, member.id));
		expect(row?.role).toBe("admin");
		const [invitation] = await db
			.select()
			.from(staffInvitation)
			.where(eq(staffInvitation.email, member.email));
		expect(invitation?.acceptedAt).not.toBeNull();
		const events = await db
			.select()
			.from(auditLog)
			.where(
				and(
					eq(auditLog.actorId, member.id),
					eq(auditLog.action, "staff.invite_accept"),
				),
			);
		expect(events).toHaveLength(1);
		expect(events[0]?.details).toMatchObject({ from: "member", to: "admin" });
		// A second sign-in finds nothing left to accept.
		expect(
			await acceptStaffInvitation(db, { ...member, role: "admin" }),
		).toBeNull();
	});

	test("matches the email whatever its case", async () => {
		const member = await makeMember("case", "member");
		await offer("case", "moderator");
		expect(
			await acceptStaffInvitation(db, {
				...member,
				email: member.email.toUpperCase(),
			}),
		).toBe("moderator");
	});

	test("an expired offer gives nothing", async () => {
		const member = await makeMember("late", "member");
		await offer("late", "admin", { expiresAt: new Date(Date.now() - 1000) });
		expect(await acceptStaffInvitation(db, member)).toBeNull();
		const [row] = await db.select().from(user).where(eq(user.id, member.id));
		expect(row?.role).toBe("member");
	});

	test("a revoked offer gives nothing", async () => {
		const member = await makeMember("revoked", "member");
		await offer("revoked", "admin", { revokedAt: new Date() });
		expect(await acceptStaffInvitation(db, member)).toBeNull();
	});

	test("an offer that would not raise the role is left alone", async () => {
		const member = await makeMember("same", "moderator");
		await offer("same", "moderator");
		expect(await acceptStaffInvitation(db, member)).toBeNull();
		const [invitation] = await db
			.select()
			.from(staffInvitation)
			.where(eq(staffInvitation.email, member.email));
		expect(invitation?.acceptedAt).toBeNull();
	});

	test("an email with no offer gives nothing", async () => {
		const member = await makeMember("none", "member");
		expect(await acceptStaffInvitation(db, member)).toBeNull();
	});
});
