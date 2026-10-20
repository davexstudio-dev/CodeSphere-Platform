import { describe, expect, test } from "bun:test";
import { ROLES } from "@codesphere/contract/roles";

import { roleCan, roles } from "./access";

const can = (role: string, permissions: Record<string, string[]>) =>
	roleCan(role, permissions as never);

// The matrix of #285: one row per resource, the roles that hold it.
const matrix: [Record<string, string[]>, string[]][] = [
	[
		{ moderation: ["list", "suspend", "reactivate", "remove"] },
		["moderator", "admin", "super_admin"],
	],
	[
		{ tag: ["list", "create", "rename", "reserve", "delete"] },
		["moderator", "admin", "super_admin"],
	],
	[{ audit: ["read"] }, ["moderator", "admin", "super_admin"]],
	[{ audit: ["export"] }, ["admin", "super_admin"]],
	[{ hackathon: ["update"] }, ["admin", "super_admin"]],
	[{ organization: ["manage"] }, ["admin", "super_admin"]],
	[{ job: ["manage"] }, ["admin", "super_admin"]],
	[{ team: ["manage"] }, ["admin", "super_admin"]],
	[{ watch: ["manage"] }, ["admin", "super_admin"]],
	[{ social: ["manage"] }, ["admin", "super_admin"]],
	[{ kpi: ["read"] }, ["admin", "super_admin"]],
	[
		{ staff: ["list", "invite", "set-role", "deactivate", "revoke-sessions"] },
		["admin", "super_admin"],
	],
];

describe("access control", () => {
	test("defines exactly the roles of the database enum", () => {
		expect(Object.keys(roles).sort()).toEqual([...ROLES].sort());
	});

	for (const [permissions, holders] of matrix) {
		for (const role of ROLES) {
			const expected = holders.includes(role);
			test(`${role} ${expected ? "holds" : "lacks"} ${JSON.stringify(permissions)}`, () => {
				expect(can(role, permissions)).toBe(expected);
			});
		}
	}

	test("an unknown role holds nothing", () => {
		expect(can("agent", { moderation: ["list"] })).toBe(false);
	});

	test("no role reaches the plugin's own role, ban or session endpoints", () => {
		for (const role of ROLES) {
			for (const action of [
				"set-role",
				"ban",
				"impersonate",
				"delete",
				"set-password",
			]) {
				expect(can(role, { user: [action] })).toBe(false);
			}
			expect(can(role, { session: ["revoke"] })).toBe(false);
		}
	});
});
