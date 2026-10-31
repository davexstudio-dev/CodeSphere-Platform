import { parseAgentRules } from "@codesphere/api/agents/moderation";
import { parseFeedRanking } from "@codesphere/api/feed-mixed/ranking";
import { deliver } from "@codesphere/api/outbox/consumer";
import { consumersWith } from "@codesphere/api/outbox/consumers";
import {
	cloudflareQueue,
	type QueueBinding,
} from "@codesphere/api/outbox/loop";
import type { QueueMessage } from "@codesphere/api/outbox/relay";
import {
	drainOutbox,
	markConsumerFailed,
	QUEUE_MAX_RETRIES,
} from "@codesphere/api/outbox/relay";
import { parseFarmingLimits } from "@codesphere/api/reputation/farming";
import { parsePrivilegeThresholds } from "@codesphere/api/reputation/service";
import { runIngestion } from "@codesphere/api/watch/ingest";
import { postgresWriteQuota } from "@codesphere/api/write-quota";
import { createAuth } from "@codesphere/auth";
import { parseAdminEmails } from "@codesphere/auth/admin";
import { type Database, DatabaseUnavailableError } from "@codesphere/db";
import { createEdgeDb } from "@codesphere/db/edge";
import { createLogger } from "@codesphere/logger";
import type { ExecutionContext, Hono } from "hono";

import { type AppDeps, createApp } from "./app";
import { createMailHooks, createNotifications } from "./mail";
import { type SocialDepsEnv, socialFromEnv } from "./social";

/**
 * Cloudflare Worker entry for the API (pull request previews, staging; #103).
 *
 * No `varlock/auto-load`, no Node tracer, no process signals: configuration arrives as
 * Worker bindings (`wrangler preview --var` and `--secrets-file`), the database is reached
 * over HTTP, and logs are JSON lines on the console that Workers Logs collects.
 */
export type WorkerEnv = SocialDepsEnv & {
	/** Absent on a preview without a database (map #86, #150): the API then answers 503 on readiness. */
	DATABASE_URL?: string;
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	CORS_ORIGIN: string;
	SUPER_ADMIN_EMAILS?: string;
	ADMIN_EMAILS?: string;
	MODERATOR_EMAILS?: string;
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
	AGENT_RULES?: string;
	FARMING_LIMITS?: string;
	FEED_RANKING?: string;
	HACKATHON_REQUIRE_GITHUB?: string;
	/** Cloudflare Queues producer of the events (#259); without it the Worker has no queue to drain into. */
	EVENTS?: QueueBinding;
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
	// A bad encryption secret turns the social accounts off, not the whole API.
	let social: AppDeps["social"];
	try {
		social = socialFromEnv(env, db);
	} catch (error) {
		logger.error({ error: String(error) }, "social accounts disabled");
	}
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
		writeQuota: postgresWriteQuota(db),
		agentRules: parseAgentRules(env.AGENT_RULES),
		farmingLimits: parseFarmingLimits(env.FARMING_LIMITS),
		feedRanking: parseFeedRanking(env.FEED_RANKING),
		superAdminEmails: parseAdminEmails(env.SUPER_ADMIN_EMAILS),
		teamDeps: { requireGithub: env.HACKATHON_REQUIRE_GITHUB === "true" },
		privilegeThresholds: parsePrivilegeThresholds(env.PRIVILEGE_THRESHOLDS),
		notifications: createNotifications(env, logger),
		...(social ? { social } : {}),
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
	const key = `${env.BETTER_AUTH_URL}|${env.DATABASE_URL ?? ""}|${env.PRIVILEGE_THRESHOLDS ?? ""}|${env.AGENT_RULES ?? ""}|${env.FARMING_LIMITS ?? ""}|${env.FEED_RANKING ?? ""}|${env.HACKATHON_REQUIRE_GITHUB ?? ""}`;
	if (!cached || cached.key !== key) {
		cached = { key, app: buildApp(env) };
	}
	return cached.app.fetch(request, env, ctx);
}

/**
 * Cloudflare Cron Trigger: the outbox is drained into Queues on every run (#259), and the watch
 * feed's Sources are read on the half-hourly one (#255). Each run takes a bounded batch, so a
 * frequent schedule spreads the work within a Worker's limits.
 */
export async function apiScheduled(
	env: WorkerEnv,
	ctx: WorkerContext,
	cron?: string,
): Promise<void> {
	if (!env.DATABASE_URL) {
		return;
	}
	const db = createEdgeDb({ DATABASE_URL: env.DATABASE_URL });
	const log = (msg: string, extra: object) =>
		console.log(JSON.stringify({ msg, ...extra }));
	const fail = (msg: string) => (error: unknown) =>
		console.error(JSON.stringify({ msg, error: String(error) }));
	if (env.EVENTS) {
		ctx.waitUntil(
			drainOutbox(db, cloudflareQueue(env.EVENTS)).then(
				(result) => result.claimed > 0 && log("outbox drained", result),
				fail("outbox drain failed"),
			),
		);
	}
	// Every schedule drains the outbox; only the every-minute one skips reading the Sources, so
	// retuning the other schedule in wrangler.jsonc never silently stops the ingestion.
	if (cron !== DRAIN_ONLY_CRON) {
		ctx.waitUntil(
			runIngestion(db).then(
				(result) => log("watch ingestion", result),
				fail("watch ingestion failed"),
			),
		);
	}
}

/** The cron schedule of apps/web/wrangler.jsonc that only drains the outbox. */
export const DRAIN_ONLY_CRON = "* * * * *";

/** The Queues consumer (#259): each message goes to the consumers that want it, once each. */
export async function apiQueue(
	batch: {
		messages: {
			body: QueueMessage;
			ack(): void;
			retry(options?: { delaySeconds?: number }): void;
			attempts?: number;
		}[];
	},
	env: WorkerEnv,
): Promise<void> {
	if (!env.DATABASE_URL) {
		for (const message of batch.messages) {
			message.retry({ delaySeconds: 60 });
		}
		return;
	}
	const db = createEdgeDb({ DATABASE_URL: env.DATABASE_URL });
	// A bad encryption secret fails the posts, retryably, not the other consumers.
	let social: AppDeps["social"];
	try {
		social = socialFromEnv(env, db);
	} catch (error) {
		console.error(
			JSON.stringify({ msg: "social accounts disabled", error: String(error) }),
		);
	}
	const consumers = consumersWith(social);
	for (const message of batch.messages) {
		try {
			await deliver(db, consumers, message.body);
			message.ack();
		} catch (error) {
			console.error(
				JSON.stringify({
					msg: "consumer failed",
					id: message.body.id,
					error: String(error),
				}),
			);
			// The last retry: record the failure on the outbox row, then let the queue dead-letter it.
			if ((message.attempts ?? 1) > QUEUE_MAX_RETRIES) {
				await markConsumerFailed(db, message.body.id, String(error)).catch(
					() => undefined,
				);
			}
			// Only the consumers that failed run again: the others left their marker.
			message.retry({
				delaySeconds: Math.min(2 ** (message.attempts ?? 1), 300),
			});
		}
	}
}
