import { createRequire } from "node:module";

import type { MiddlewareHandler } from "hono";
import pino, {
	type DestinationStream,
	type LevelWithSilent,
	type Logger,
} from "pino";

import { truncateIp } from "./ip";
import { resolveTraceId } from "./trace";

export type { Logger } from "pino";
export { truncateIp } from "./ip";
export { type ErrorReporter, noopReporter } from "./reporter";
export { resolveTraceId } from "./trace";

export type LoggerOptions = {
	level?: LevelWithSilent;
	/** Human-readable output for development; JSON otherwise. */
	pretty?: boolean;
	/** Where the lines go (tests capture them); stdout by default. */
	destination?: DestinationStream;
};

// Headers and fields that must never reach a log line (spec §4), whatever a caller logs.
const REDACT = [
	"req.headers.authorization",
	"req.headers.cookie",
	"headers.authorization",
	"headers.cookie",
	"*.password",
	"*.token",
	"*.accessToken",
	"*.refreshToken",
	"*.email",
	"email",
	"password",
	"token",
	"*.*.email",
];

// pino resolves a transport target from its own directory, where a package manager with isolated
// node_modules (Bun's) does not link pino-pretty: resolve it here, from the package that owns it.
const prettyTarget = () =>
	createRequire(import.meta.url).resolve("pino-pretty");

export function createLogger(options: LoggerOptions = {}): Logger {
	const settings = {
		level: options.level ?? "info",
		redact: { paths: REDACT, censor: "[redacted]" },
		...(options.pretty && !options.destination
			? { transport: { target: prettyTarget() } }
			: {}),
	};
	return options.destination
		? pino(settings, options.destination)
		: pino(settings);
}

export type LoggerEnv = {
	Variables: { logger: Logger; requestId: string; traceId: string };
};

const REQUEST_ID_HEADER = "x-request-id";
const TRACE_ID_HEADER = "x-trace-id";

// An incoming id is echoed and logged, so only a short, plain token is kept.
const VALID_REQUEST_ID = /^[\w-]{1,64}$/;

export type RequestLoggerOptions = {
	/**
	 * Read the client IP from `x-forwarded-for`. Only behind a proxy that sets it (Caddy,
	 * Cloudflare): otherwise any client could forge the logged address.
	 */
	trustProxy: boolean;
};

function clientIp(forwardedFor: string | undefined): string | undefined {
	return forwardedFor?.split(",")[0]?.trim() || undefined;
}

/**
 * One log line per request with its id, method, path, status, duration and truncated IP.
 * The id comes from `x-request-id` when a proxy set one, is returned in the response, and is
 * bound to a child logger the handlers read with `c.get("logger")`. No header is logged.
 * The trace id (#253) comes from a valid W3C `traceparent` (Cloudflare, the web app, a caller) or
 * is generated; it is logged, returned in `x-trace-id` and handed to the error reporter.
 */
export function requestLogger(
	logger: Logger,
	options: RequestLoggerOptions,
): MiddlewareHandler<LoggerEnv> {
	return async (c, next) => {
		const incoming = c.req.header(REQUEST_ID_HEADER);
		const requestId =
			incoming && VALID_REQUEST_ID.test(incoming)
				? incoming
				: crypto.randomUUID();
		const traceId = resolveTraceId(c.req.header("traceparent"));
		const child = logger.child({ reqId: requestId, traceId });
		c.set("requestId", requestId);
		c.set("traceId", traceId);
		c.set("logger", child);
		c.header(REQUEST_ID_HEADER, requestId);
		c.header(TRACE_ID_HEADER, traceId);
		const start = performance.now();
		await next();
		child.info(
			{
				method: c.req.method,
				path: c.req.path,
				status: c.res.status,
				durationMs: Math.round(performance.now() - start),
				ip: options.trustProxy
					? truncateIp(clientIp(c.req.header("x-forwarded-for")))
					: undefined,
			},
			"request completed",
		);
	};
}
