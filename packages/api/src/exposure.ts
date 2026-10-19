import type { AnyProcedureContract } from "@orpc/contract";

// Which procedures leave the web app (#122). Admin procedures are documented over REST when they
// declare an explicit route, for staff only (requireAdmin). They are never MCP tools unless read-only,
// so an Agent never sees an admin write.

type Meta = {
	"~openapi"?: { method?: string; path?: string };
	"~mcp"?: { type?: string; annotations?: { readOnlyHint?: boolean } };
};

const metaOf = (procedure: { "~orpc": unknown }) =>
	((procedure["~orpc"] as { meta?: Meta }).meta ?? {}) as Meta;

/** Reads are explicit GET routes; anything else, a procedure with no route included, writes. */
export function isRead(procedure: { "~orpc": unknown }): boolean {
	return metaOf(procedure)["~openapi"]?.method === "GET";
}

/** The one write a `curate` key may make: proposing a link to the watch feed (#255). */
export function isWatchSubmission(procedure: { "~orpc": unknown }): boolean {
	const openapi = metaOf(procedure)["~openapi"];
	return openapi?.method === "POST" && openapi.path === "/watch/items";
}

/**
 * OpenAPI `filter` for the handler and the generator. An admin procedure is documented only when it
 * declares its own route, whatever its method: a bare one has no REST operation to expose.
 */
export function exposedOverOpenAPI(
	procedure: Pick<AnyProcedureContract, "~orpc">,
	path: readonly string[],
): boolean {
	return path[0] !== "admin" || metaOf(procedure)["~openapi"] !== undefined;
}

/**
 * MCP `authorizeCatalogEntry` gate, for discovery and invocation alike: an admin procedure must
 * declare itself read-only. Mirrors `exposedOverOpenAPI`, so a mutation is hidden on both surfaces.
 */
export function exposedOverMCP(entry: {
	path: readonly string[];
	meta: object;
}): boolean {
	return (
		entry.path[0] !== "admin" ||
		(entry.meta as { annotations?: { readOnlyHint?: boolean } }).annotations
			?.readOnlyHint === true
	);
}

/** Every procedure tagged as an MCP tool, with whether it declares itself read-only. */
export function mcpTools(
	router: object,
	path: string[] = [],
): { path: string[]; readOnly: boolean }[] {
	if ("~orpc" in router) {
		const tool = metaOf(router as { "~orpc": unknown })["~mcp"];
		return tool?.type === "tool"
			? [{ path, readOnly: tool.annotations?.readOnlyHint === true }]
			: [];
	}
	return Object.entries(router).flatMap(([key, child]) =>
		child && typeof child === "object" ? mcpTools(child, [...path, key]) : [],
	);
}
