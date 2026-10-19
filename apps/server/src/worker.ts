import { parsePrivilegeThresholds } from "@codesphere/api/reputation/service";
import { createAuth } from "@codesphere/auth";
import { type Database, DatabaseUnavailableError } from "@codesphere/db";
import { createEdgeDb } from "@codesphere/db/edge";
import { createLogger } from "@codesphere/logger";
import type { ExecutionContext, Hono } from "hono";

import { type AppDeps, createApp } from "./app";
import { createMailHooks, createNotifications } from "./mail";

/**
 * Cloudflare Worker entry for the API (pull request previews, staging; #103).
 *
 * No `varlock/auto-load`, no Node tracer, no process signals: configuration arrives as
 * Worker bindings (`wrangler preview --var` and `--secrets-file`), the database is reached
 * over HTTP, and logs are JSON lines on the console that Workers Logs collects.
 */
export type WorkerEnv = {
	/** Absent on a preview without a database (map #86, #150): the API then answers 503 on readiness. */
	DATABASE_URL?: string;
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	CORS_ORIGIN: string;
	ADMIN_EMAILS?: string;
	RESEND_API_KEY?: string;
	EMAIL_FROM?: string;
	RESEND_WEBHOOK_SECRET?: string;
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
	GITLAB_CLIENT_ID?: string;
	GITLAB_CLIENT_SECRET?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	OAUTH_PROXY_SECRET?: string;
	OAUTH_PROXY_PRODUCTION_URL?: string;
	LOG_LEVEL?:
		| "fatal"
		| "error"
		| "warn"
		| "info"
		| "debug"
		| "trace"
		| "silent";
	PRIVILEGE_THRESHOLDS?: string;
	APP_VERSION?: string;
	GIT_SHA?: string;
};

const REQUIRED = [
	"BETTER_AUTH_SECRET",
	"BETTER_AUTH_URL",
	"CORS_ORIGIN",
] as const;

/** Paths this entry serves; everything else belongs to the web application. */
const API_PREFIXES = ["/api/auth", "/api/v1", "/rpc", "/mcp"] as const;

export function isApiPath(pathname: string): boolean {
	return API_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}

/** The Workers execution context, as Hono types it (no workers-types dependency). */
export type WorkerContext = ExecutionContext;

let cached: { key: string; app: Hono<never> } | undefined;

/**
 * A database that fails on first use, for a preview deployed without one. Every query rejects, so
 * `/ready` answers 503 (its handler catches the error) and sign-in fails cleanly instead of the
 * whole Worker refusing to start.
 */
export function withoutDatabase(): Database {
	const unavailable = (): never => {
		throw new DatabaseUnavailableError();
	};
	return new Proxy({} as Database, { get: () => unavailable });
}

function buildApp(env: WorkerEnv) {
	const missing = REQUIRED.filter((name) => !env[name]);
	if (missing.length > 0) {
		throw new Error(`Worker is missing bindings: ${missing.join(", ")}`);
	}
	const db = env.DATABASE_URL
		? createEdgeDb({ DATABASE_URL: env.DATABASE_URL })
		: withoutDatabase();
	const logger = createLogger({
		level: env.LOG_LEVEL ?? "info",
		// Console, not stdout: there is no file descriptor to write to on Workers.
		destination: { write: (line) => console.log(line.trimEnd()) },
	});
	const deps: AppDeps = {
		auth: createAuth(env, db, [], createMailHooks(env, logger)),
		db,
		logger,
		corsOrigin: env.CORS_ORIGIN,
		// Behind Cloudflare, x-forwarded-for is set by the platform.
		trustProxy: true,
		release: {
			version: env.APP_VERSION ?? "dev",
			commit: env.GIT_SHA ?? "dev",
		},
		// The public Worker never serves the spec or its UI: they are for development only.
		apiDocs: false,
		privilegeThresholds: parsePrivilegeThresholds(env.PRIVILEGE_THRESHOLDS),
		notifications: createNotifications(env, logger),
		resendWebhookSecret: env.RESEND_WEBHOOK_SECRET,
	};
	return createApp(deps) as unknown as Hono<never>;
}

/** Built once per isolate: every service is stateless over HTTP. */
export function apiFetch(
	request: Request,
	env: WorkerEnv,
	ctx: WorkerContext,
): Response | Promise<Response> {
	const key = `${env.BETTER_AUTH_URL}|${env.DATABASE_URL ?? ""}`;
	if (!cached || cached.key !== key) {
		cached = { key, app: buildApp(env) };
	}
	return cached.app.fetch(request, env, ctx);
}
