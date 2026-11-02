/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createRouterClient } from "@orpc/server";

import type { Context } from "./context";
import { appRouter } from "./routers";
import { testContext } from "./test-context";

type Row = Record<string, unknown>;

// Minimal in-memory stand-in for the drizzle calls the members procedures make.
function fakeDb(rows: Row[]) {
	let target: Row | undefined;
	const chain = {
		select: () => chain,
		from: () => chain,
		update: () => chain,
		set: (patch: Row) => {
			chain.patch = patch;
			return chain;
		},
		patch: undefined as Row | undefined,
		where: () => {
			target = rows[0];
			return chain;
		},
		returning: async () => {
			if (target && chain.patch) {
				Object.assign(target, chain.patch);
			}
			return target ? [target] : [];
		},
		// biome-ignore lint/suspicious/noThenProperty: mimics drizzle's awaitable query builder
		then: (resolve: (value: Row[]) => void) => resolve(target ? [target] : []),
	};
	return chain as unknown as Context["db"];
}

const ada = (): Row => ({
	id: "u1",
	name: "Ada",
	image: null,
	email: "ada@example.com",
	kind: "human",
	ownerId: null,
	country: "BF",
	city: "Ouagadougou",
	cityPublic: false,
	hideAgentContent: false,
	locale: null,
	tagsOnboardingSkippedAt: null,
});

function client(rows: Row[], signedIn: boolean) {
	const session = signedIn
		? ({ user: { id: "u1" }, session: { id: "s1" } } as unknown as Session)
		: null;
	return createRouterClient(appRouter, {
		context: testContext({ session, db: fakeDb(rows) }),
	});
}

describe("members.update", () => {
	test("saves the profile and returns it without the email", async () => {
		const rows = [ada()];
		const result = await client(rows, true).members.update({
			country: "SN",
			cityPublic: true,
		});
		expect(result.country).toBe("SN");
		expect(result.cityPublic).toBe(true);
		expect(JSON.stringify(result)).not.toContain("ada@example.com");
	});

	test("rejects a visitor with UNAUTHORIZED", async () => {
		await expect(
			client([ada()], false).members.update({ name: "Eve" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	test("rejects an invalid country", async () => {
		await expect(
			client([ada()], true).members.update({ country: "BFA" }),
		).rejects.toBeDefined();
	});
});

describe("members.get", () => {
	test("hides the private city from others and never shows the email", async () => {
		const result = await client([ada()], false).members.get({ id: "u1" });
		expect(result.city).toBeNull();
		expect(JSON.stringify(result)).not.toContain("ada@example.com");
	});

	test("answers NOT_FOUND for an unknown member", async () => {
		await expect(
			client([], false).members.get({ id: "nope" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("members.me", () => {
	test("requires a session", async () => {
		await expect(client([ada()], false).members.me()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});
});
