/// <reference types="bun" />
// Staff roles managed from the back-office (#285): integration test against a real Postgres,
// through the router.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import type { Role } from "@codesphere/contract/roles";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { session, user } from "@codesphere/db/schema/auth";
import { createRouterClient } from "@orpc/server";
import { and, eq, inArray } from "drizzle-orm";

import { appRouter } from "./routers";
import { testContext } from "./test-context";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("staff roles on Postgres (#285)", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID();
	const id = (name: string) => `it-staff-${name}-${run}`;
	const accounts: Record<string, Role> = {
		boss: "super_admin",
		envBoss: "super_admin",
		admin: "admin",
		peer: "admin",
		mod: "moderator",
		member: "member",
		target: "member",
	};
	const ids = Object.keys(accounts).map(id);
	const email = (name: string) => `${id(name)}@example.com`;

	const as = (name: string) =>
		createRouterClient(appRouter, {
			context: testContext({
				db,
				superAdminEmails: new Set([email("envBoss")]),
				session: {
					user: {
						id: id(name),
						role: accounts[name],
						kind: "human",
						suspendedAt: null,
					},
					session: { id: `s-${name}` },
				} as unknown as Session,
			}),
		}).admin;

	const roleOf = async (name: string) => {
		const [row] = await db
			.select({ role: user.role })
			.from(user)
			.where(eq(user.id, id(name)));
		return row?.role;
	};
	const sessionsOf = async (name: string) =>
		(
			await db
				.select()
				.from(session)
				.where(eq(session.userId, id(name)))
		).length;
	const openSession = (name: string) =>
		db.insert(session).values({
			id: crypto.randomUUID(),
			token: crypto.randomUUID(),
			userId: id(name),
			expiresAt: new Date(Date.now() + 3_600_000),
		});

	beforeAll(async () => {
		await db.insert(user).values(
			Object.entries(accounts).map(([name, role]) => ({
				id: id(name),
				name: `IT ${name}`,
				email: email(name),
				emailVerified: true,
				role,
			})),
		);
	});

	afterAll(async () => {
		await db.delete(auditLog).where(inArray(auditLog.actorId, ids));
		await db.delete(session).where(inArray(session.userId, ids));
		await db.delete(user).where(inArray(user.id, ids));
	});

	test("an admin promotes a Member to moderator, audited with both roles", async () => {
		const member = await as("admin").staff.setRole({
			id: id("target"),
			role: "moderator",
			reason: "Renfort modération",
		});
		expect(member.role).toBe("moderator");
		const [event] = await db
			.select()
			.from(auditLog)
			.where(
				and(
					eq(auditLog.actorId, id("admin")),
					eq(auditLog.action, "member.set_role"),
				),
			);
		expect(event?.targetId).toBe(id("target"));
		expect(event?.details).toEqual({
			from: "member",
			to: "moderator",
			reason: "Renfort modération",
		});
	});

	test("a demotion signs the Member out at once", async () => {
		await openSession("target");
		expect(await sessionsOf("target")).toBe(1);
		await as("admin").staff.setRole({
			id: id("target"),
			role: "member",
			reason: "Fin du renfort",
		});
		expect(await roleOf("target")).toBe("member");
		expect(await sessionsOf("target")).toBe(0);
	});

	test("an admin cannot reach a peer nor give super_admin", async () => {
		await expect(
			as("admin").staff.setRole({
				id: id("peer"),
				role: "member",
				reason: "Test",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			as("admin").staff.setRole({
				id: id("member"),
				role: "super_admin",
				reason: "Test",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(await roleOf("peer")).toBe("admin");
		expect(await roleOf("member")).toBe("member");
	});

	test("a moderator manages no staff account", async () => {
		await expect(
			as("mod").staff.setRole({
				id: id("member"),
				role: "moderator",
				reason: "Test",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("nobody changes their own role", async () => {
		await expect(
			as("boss").staff.setRole({
				id: id("boss"),
				role: "admin",
				reason: "Test",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("a super admin set by the environment is never demoted", async () => {
		await expect(
			as("boss").staff.setRole({
				id: id("envBoss"),
				role: "admin",
				reason: "Test",
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(await roleOf("envBoss")).toBe("super_admin");
	});

	test("a super admin demotes another super admin while one remains", async () => {
		await db
			.update(user)
			.set({ role: "super_admin" })
			.where(eq(user.id, id("peer")));
		await as("boss").staff.setRole({
			id: id("peer"),
			role: "admin",
			reason: "Test",
		});
		expect(await roleOf("peer")).toBe("admin");
	});

	test("the moderation screen keeps its moderators, not hackathons or KPIs", async () => {
		await expect(as("mod").kpi({ period: "7d" })).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(as("mod").social.status({})).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(as("mod").tags.list({})).resolves.toBeDefined();
	});

	test("suspending a staff member revokes their sessions", async () => {
		await openSession("mod");
		await as("admin").members.suspend({
			id: id("mod"),
			reason: "Départ de l'équipe",
		});
		expect(await sessionsOf("mod")).toBe(0);
	});

	test("an admin signs a moderator out; a moderator cannot", async () => {
		await openSession("member");
		await expect(
			as("mod").staff.revokeSessions({ id: id("member") }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await as("admin").staff.revokeSessions({ id: id("member") });
		expect(await sessionsOf("member")).toBe(0);
	});
});
