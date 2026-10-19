/// <reference types="bun" />
// #122: admin mutations never reach the MCP server. They are documented over REST for staff only.
import { describe, expect, test } from "bun:test";
import { contract } from "@codesphere/contract";
import { OpenAPIGenerator, openapi } from "@orpc/openapi";
import { os } from "@orpc/server";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { mcp } from "orpc-mcp";
import { MCPHandler } from "orpc-mcp/fetch";
import {
	exposedOverMCP,
	exposedOverOpenAPI,
	isWatchSubmission,
	mcpTools,
} from "./exposure";
import { appRouter } from "./routers";

const mutation = os
	.meta(openapi({ method: "POST", path: "/admin/tags" }))
	.handler(() => null);
const read = os
	.meta(openapi({ method: "GET", path: "/admin/audit-log" }))
	.handler(() => null);
const bare = os.handler(() => null);

describe("exposedOverOpenAPI", () => {
	test("documents an admin write that declares its route", () => {
		expect(exposedOverOpenAPI(mutation, ["admin", "tags", "create"])).toBe(
			true,
		);
	});

	test("hides an admin procedure without an explicit route", () => {
		expect(exposedOverOpenAPI(bare, ["admin", "tags", "create"])).toBe(false);
	});

	test("keeps an admin read and any non-admin procedure", () => {
		expect(exposedOverOpenAPI(read, ["admin", "auditLog", "list"])).toBe(true);
		expect(exposedOverOpenAPI(mutation, ["members", "update"])).toBe(true);
	});
});

describe("the served router", () => {
	test("the OpenAPI spec documents the admin writes for staff", async () => {
		const spec = await new OpenAPIGenerator({
			converters: [new ZodToJsonSchemaConverter()],
		}).generate(appRouter, { filter: exposedOverOpenAPI });
		const operations = (path: string) =>
			Object.keys(
				(spec.paths as Record<string, object> | undefined)?.[path] ?? {},
			);
		expect(operations("/admin/audit-log")).toEqual(["get"]);
		expect(operations("/admin/hackathons/{slug}")).toEqual(["patch"]);
		expect(operations("/admin/questions/{id}")).toEqual(["delete"]);
	});

	test("every admin MCP tool is read-only", () => {
		const admin = mcpTools(appRouter).filter(({ path }) => path[0] === "admin");
		expect(admin.length).toBeGreaterThan(0);
		expect(admin.every(({ readOnly }) => readOnly)).toBe(true);
	});

	test("an admin mutation tagged for MCP would be caught", () => {
		const router = {
			admin: {
				tags: {
					create: os.meta(mcp.tool({ description: "x" })).handler(() => null),
				},
			},
		};
		expect(mcpTools(router)).toEqual([
			{ path: ["admin", "tags", "create"], readOnly: false },
		]);
	});
});

describe("exposedOverMCP", () => {
	const entry = (path: string[], annotations?: { readOnlyHint?: boolean }) => ({
		path,
		meta: { annotations },
	});

	test("hides an admin procedure that is not declared read-only", () => {
		expect(exposedOverMCP(entry(["admin", "tags", "create"]))).toBe(false);
		expect(
			exposedOverMCP(
				entry(["admin", "tags", "create"], { readOnlyHint: false }),
			),
		).toBe(false);
	});

	test("keeps an admin procedure declared read-only", () => {
		expect(
			exposedOverMCP(
				entry(["admin", "auditLog", "list"], { readOnlyHint: true }),
			),
		).toBe(true);
	});

	test("keeps any non-admin procedure", () => {
		expect(exposedOverMCP(entry(["members", "update"]))).toBe(true);
	});
});

describe("the MCP handler's catalog gate", () => {
	const router = {
		hello: os.meta(mcp.tool({ description: "public" })).handler(() => "hi"),
		admin: {
			tags: {
				create: os
					.meta(mcp.tool({ description: "mutation" }))
					.handler(() => null),
			},
			auditLog: {
				list: os
					.meta(
						mcp.tool({
							description: "read",
							annotations: { readOnlyHint: true },
						}),
					)
					.handler(() => []),
			},
		},
	};
	const call = async (gated: boolean, body: object) => {
		const handler = new MCPHandler(router, {
			converters: [new ZodToJsonSchemaConverter()],
			...(gated && {
				authorizeCatalogEntry: ({ entry }) => exposedOverMCP(entry),
			}),
		});
		const { response } = await handler.handle(
			new Request("http://localhost/", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json, text/event-stream",
				},
				body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
			}),
			{ context: {} },
		);
		return (await response?.json()) as {
			result?: { tools?: { name: string }[] };
			error?: unknown;
		};
	};

	test("without the gate an admin mutation is listed (control)", async () => {
		const res = await call(false, { method: "tools/list", params: {} });
		expect(res.result?.tools?.map((t) => t.name)).toContain(
			"admin_tags_create",
		);
	});

	test("with the gate the list shows public tools and read-only admin tools only", async () => {
		const res = await call(true, { method: "tools/list", params: {} });
		expect(res.result?.tools?.map((t) => t.name).sort()).toEqual([
			"admin_auditLog_list",
			"hello",
		]);
	});

	test("with the gate an admin mutation cannot be invoked", async () => {
		const res = await call(true, {
			method: "tools/call",
			params: { name: "admin_tags_create", arguments: {} },
		});
		expect(res.result).toBeUndefined();
		expect(res.error).toMatchObject({
			message: "Unknown tool: admin_tags_create",
		});
	});
});

describe("isWatchSubmission", () => {
	test("a curate key may propose a link and nothing else", () => {
		expect(isWatchSubmission(contract.watch.submit)).toBe(true);
		expect(isWatchSubmission(contract.watch.vote)).toBe(false);
		expect(isWatchSubmission(contract.watch.list)).toBe(false);
		expect(isWatchSubmission(contract.questions.create)).toBe(false);
	});
});
