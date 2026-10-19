/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createRouterClient } from "@orpc/server";

import { appRouter } from "./routers";
import { testContext } from "./test-context";

function client(session: Session | null = null) {
	return createRouterClient(appRouter, {
		// The default database fails on every query: it stands in for an outage.
		context: testContext({ session, requestId: "req-42" }),
	});
}

describe("invalid input", () => {
	test("answers the contract's typed BAD_REQUEST with each issue's path and message", async () => {
		const error = await client()
			// @ts-expect-error the slug must be a string
			.hackathons.get({ slug: 42 })
			.catch((caught: unknown) => caught);
		expect(error).toMatchObject({
			code: "BAD_REQUEST",
			defined: true,
			data: { issues: [{ path: ["slug"], message: expect.any(String) }] },
		});
	});

	test("leaves other typed errors untouched", async () => {
		// No session: members.me answers UNAUTHORIZED before touching the database.
		await expect(client().members.me()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});
});

describe("unexpected failure", () => {
	test("answers INTERNAL_SERVER_ERROR with the request id and no detail", async () => {
		const admin = {
			user: { id: "u1", role: "admin", kind: "human" },
			session: { id: "s1" },
		} as unknown as Session;
		const error = await client(admin)
			.admin.auditLog.list({ limit: 5 })
			.catch((caught: unknown) => caught);
		expect(error).toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
			defined: true,
			data: { requestId: "req-42" },
		});
		expect((error as Error).message).not.toContain("select");
	});

	test("reports the unexpected error with the trace id, and survives a failing tracker", async () => {
		const admin = {
			user: { id: "u1", role: "admin", kind: "human" },
			session: { id: "s1" },
		} as unknown as Session;
		const reported: unknown[] = [];
		const reporting = createRouterClient(appRouter, {
			context: testContext({
				session: admin,
				requestId: "req-42",
				traceId: "t-1",
				reportError: (error) => reported.push(error),
			}),
		});
		const error = await reporting.admin.auditLog
			.list({ limit: 5 })
			.catch((caught: unknown) => caught);
		expect(reported).toHaveLength(1);
		expect(error).toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
			data: { requestId: "req-42", traceId: "t-1" },
		});

		const broken = createRouterClient(appRouter, {
			context: testContext({
				session: admin,
				reportError: () => {
					throw new Error("tracker down");
				},
			}),
		});
		await expect(
			broken.admin.auditLog.list({ limit: 5 }),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});

	test("does not report expected errors", async () => {
		const reported: unknown[] = [];
		const reporting = createRouterClient(appRouter, {
			context: testContext({ reportError: (e) => reported.push(e) }),
		});
		await expect(reporting.members.me()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		expect(reported).toHaveLength(0);
	});
});
