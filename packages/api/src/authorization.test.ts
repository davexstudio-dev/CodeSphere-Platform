/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";

import { requireAdmin, requirePermission } from "./authorization";

function sessionWith(role?: string, kind = "human"): Session {
	return {
		user: { id: "u1", name: "Ada", role, kind, email: "ada@example.com" },
		session: { id: "s1" },
	} as unknown as Session;
}

describe("requireAdmin", () => {
	test("requires a session", () => {
		expect(requireAdmin(null)).toEqual({ ok: false, code: "UNAUTHORIZED" });
	});

	test("rejects a member", () => {
		expect(requireAdmin(sessionWith("member"))).toEqual({
			ok: false,
			code: "FORBIDDEN",
		});
	});

	test("rejects an agent", () => {
		expect(requireAdmin(sessionWith("agent"))).toEqual({
			ok: false,
			code: "FORBIDDEN",
		});
	});

	test("rejects a user without a role", () => {
		expect(requireAdmin(sessionWith(undefined))).toEqual({
			ok: false,
			code: "FORBIDDEN",
		});
	});

	test("allows an admin", () => {
		expect(requireAdmin(sessionWith("admin"))).toEqual({
			ok: true,
			role: "admin",
		});
	});

	test("admits the moderator and super_admin roles with their own role", () => {
		expect(requireAdmin(sessionWith("moderator"))).toEqual({
			ok: true,
			role: "moderator",
		});
		expect(requireAdmin(sessionWith("super_admin"))).toEqual({
			ok: true,
			role: "super_admin",
		});
	});

	test("rejects an Agent even with a staff role forced in the database (#122)", () => {
		expect(requireAdmin(sessionWith("moderator", "agent"))).toEqual({
			ok: false,
			code: "FORBIDDEN",
		});
	});

	test("rejects an Agent even with the admin role forced in the database (#122)", () => {
		expect(requireAdmin(sessionWith("admin", "agent"))).toEqual({
			ok: false,
			code: "FORBIDDEN",
		});
	});
});

describe("requirePermission (#285)", () => {
	test("admits a role holding the permission", () => {
		expect(
			requirePermission(sessionWith("moderator"), { tag: ["create"] }),
		).toEqual({ ok: true, role: "moderator" });
	});

	test("refuses a staff role lacking it", () => {
		expect(
			requirePermission(sessionWith("moderator"), { kpi: ["read"] }),
		).toEqual({ ok: false, code: "FORBIDDEN" });
	});

	test("still requires a session", () => {
		expect(requirePermission(null, { tag: ["list"] })).toEqual({
			ok: false,
			code: "UNAUTHORIZED",
		});
	});

	test("refuses a deactivated staff member", () => {
		const session = sessionWith("admin");
		(session.user as { suspendedAt?: Date }).suspendedAt = new Date();
		expect(requirePermission(session, { tag: ["list"] })).toEqual({
			ok: false,
			code: "FORBIDDEN",
		});
	});
});
