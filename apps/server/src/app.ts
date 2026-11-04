import type { AgentRules } from "@codesphere/api/agents/moderation";
import type { Context as ApiContext } from "@codesphere/api/context";
import { exposedOverMCP, exposedOverOpenAPI } from "@codesphere/api/exposure";
import type { FeedRanking } from "@codesphere/api/feed-mixed/ranking";
import { openApiDocument } from "@codesphere/api/openapi";
import type { FarmingLimits } from "@codesphere/api/reputation/farming";
import type { PrivilegeThresholds } from "@codesphere/api/reputation/service";
import { appRouter } from "@codesphere/api/routers/index";
import { countWatchClick } from "@codesphere/api/watch/clicks";
import type { WriteQuota } from "@codesphere/api/write-quota";
import type { createAuth } from "@codesphere/auth";
import type { Database } from "@codesphere/db";
import {
	type ErrorReporter,
	type Logger,
	type LoggerEnv,
	requestLogger,
} from "@codesphere/logger";
import { SmartCoercionHandlerPlugin } from "@orpc/json-schema";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferenceHandlerPlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { MCPHandler } from "orpc-mcp/fetch";

import { createContext } from "./context";
import { reportRequestError } from "./report";
import { handleResendWebhook } from "./resend-webhook";
import { handleVitalsBeacon } from "./vitals";

export type AppDeps = {
	auth: ReturnType<typeof createAuth>;
	db: Database;
	logger: Logger;
	corsOrigin: string;
	trustProxy: boolean;
	release: { version: string; commit: string };
	/** Emails the API sends on its own; left out where there is no mail provider. */
	notifications?: ApiContext["notifications"];
	/** Publishing to the official social accounts (#265, #322). */
	social?: ApiContext["social"];
	/** Serve the OpenAPI spec and its reference UI under /api/v1. Off on the public deployments. */
	apiDocs: boolean;
	/** Counters of the write limits, shared through the database (#246); per process when absent. */
	writeQuota?: WriteQuota;
	/** Anti-farming limits of the Reputation journal (#241); the defaults when absent. */
	farmingLimits?: FarmingLimits;
	/** Coefficients of the « Pour toi » ranking (#256); the defaults when absent. */
	feedRanking?: FeedRanking;
	/** Moderation of Agent Answers (#245); the defaults when absent. */
	agentRules?: AgentRules;
	/** Reputation needed for each Privilege (#240); the defaults when absent. */
	privilegeThresholds?: PrivilegeThresholds;
	/** Teams and Submissions of the Hackathons (#261): the GitHub-account requirement. */
	teamDeps?: ApiContext["teamDeps"];
	/** Error tracker for unexpected failures (#253); absent where none is configured. */
	reporter?: ErrorReporter;
	/** Signing secret of the Resend webhook (#200); without it, /webhooks/resend is not mounted. */
	resendWebhookSecret?: string;
	/** Verified emails always put back to super_admin (SUPER_ADMIN_EMAILS, #285): never demoted from the back-office. */
	superAdminEmails?: ReadonlySet<string>;
};

// Stateless handlers: built once per isolate or process, shared by every request.
let openapiSpec: ReturnType<typeof openApiDocument> | undefined;

/**
 * The REST surface. Staff operations are documented on it, and only staff can call them (requireAdmin).
 * The reference plugin adds `/spec.json` and the docs UI, so it is mounted only when asked.
 */
export function restHandler(apiDocs: boolean) {
	return new OpenAPIHandler(appRouter, {
		filter: exposedOverOpenAPI,
		plugins: [
			// Query strings arrive as text: smart coercion turns `limit=5` into the number the
			// `.input` schema declares, so the GET operations of the spec can be called as
			// documented (#65).
			new SmartCoercionHandlerPlugin({
				converters: [new ZodToJsonSchemaConverter()],
			}),
			...(apiDocs
				? [
						new OpenAPIReferenceHandlerPlugin({
							// The spec only depends on the router: generate it once, not per request.
							spec: () => {
								openapiSpec ??= openApiDocument();
								return openapiSpec;
							},
						}),
					]
				: []),
		],
	});
}

const rpcHandler = new RPCHandler(appRouter);

// Admin mutations are not MCP tools, neither listed nor callable: the same rule as the OpenAPI filter.
const mcpHandler = new MCPHandler(appRouter, {
	serverInfo: { name: "codesphere", version: "0.1.0" },
	converters: [new ZodToJsonSchemaConverter()],
	authorizeCatalogEntry: ({ entry }) => exposedOverMCP(entry),
});

/**
 * The HTTP application, free of any runtime: the Bun entry (`index.ts`) and the Cloudflare
 * Worker entry (`worker.ts`) build their services their own way and hand them over.
 */
export function createApp(deps: AppDeps) {
	const app = new Hono<LoggerEnv>();
	const apiHandler = restHandler(deps.apiDocs);

	app.use(requestLogger(deps.logger, { trustProxy: deps.trustProxy }));
	// Failures outside the oRPC procedures (auth handler, webhooks, middleware): oRPC ones are
	// reported by `unexpectedErrors`.
	app.onError((error, c) => {
		// Deliberate HTTP answers (413, 400, ...) are the client's doing, not a failure to track.
		if (error instanceof HTTPException) {
			return error.getResponse();
		}
		// requestLogger may not have run if it is what threw.
		const logger = c.get("logger") ?? deps.logger;
		logger.error({ err: error }, "request failed");
		reportRequestError(
			deps.reporter,
			logger,
			{
				traceId: c.get("traceId"),
				requestId: c.get("requestId"),
				method: c.req.method,
				path: c.req.path,
			},
			error,
		);
		return c.json(
			{
				code: "INTERNAL_SERVER_ERROR",
				data: { requestId: c.get("requestId"), traceId: c.get("traceId") },
			},
			500,
		);
	});
	app.use(
		"/*",
		cors({
			origin: deps.corsOrigin,
			allowMethods: ["GET", "POST", "OPTIONS"],
			allowHeaders: ["Content-Type", "Authorization", "traceparent"],
			// Lets the web app show the ids to quote to support (#253).
			exposeHeaders: ["x-request-id", "x-trace-id"],
			credentials: true,
		}),
	);

	app.on(["POST", "GET"], "/api/auth/*", async (c) =>
		deps.auth.handler(c.req.raw),
	);

	// Real-user Web Vitals (#251): no session needed, handled before the API middleware.
	app.post("/api/v1/vitals", (c) =>
		handleVitalsBeacon(c.req.raw, { db: deps.db }),
	);

	// Outbound click on a watch item (#256): counted per item, then redirected to the stored link.
	// No session, no cookie, no record of who clicked.
	app.get("/api/v1/watch/out/:id", async (c) => {
		// Only a real click counts: a prefetch or a HEAD request follows the link without being one.
		const url = await countWatchClick(
			deps.db,
			c.req.param("id"),
			c.req.method === "GET" && c.req.header("purpose") !== "prefetch",
		);
		return url ? c.redirect(url, 302) : c.notFound();
	});

	const { resendWebhookSecret } = deps;
	if (resendWebhookSecret) {
		// Before the API middleware: Resend has no session, and the call needs no database.
		app.post("/webhooks/resend", (c) =>
			handleResendWebhook(c.req.raw, resendWebhookSecret, c.get("logger")),
		);
	}

	app.use("/*", async (c, next) => {
		const context = await createContext({ context: c, deps });

		const rpcResult = await rpcHandler.handle(c.req.raw, {
			prefix: "/rpc",
			context: context,
		});

		if (rpcResult.matched) {
			return c.newResponse(rpcResult.response.body, rpcResult.response);
		}

		const apiResult = await apiHandler.handle(c.req.raw, {
			prefix: "/api/v1",
			context: context,
		});

		if (apiResult.matched) {
			return c.newResponse(apiResult.response.body, apiResult.response);
		}

		const mcpResult = await mcpHandler.handle(c.req.raw, {
			prefix: "/mcp",
			context: context,
		});

		if (mcpResult.matched) {
			return c.newResponse(mcpResult.response.body, mcpResult.response);
		}

		await next();
	});

	app.get("/", (c) => {
		return c.text("OK");
	});

	return app;
}
