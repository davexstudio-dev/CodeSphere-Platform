/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import { createLogger, type LoggerEnv, requestLogger } from "./index";

function appWithCapturedLogs(options: { trustProxy?: boolean } = {}) {
	const lines: Record<string, unknown>[] = [];
	const logger = createLogger({
		level: "info",
		destination: { write: (line: string) => lines.push(JSON.parse(line)) },
	});
	const app = new Hono<LoggerEnv>();
	app.use(requestLogger(logger, { trustProxy: options.trustProxy ?? true }));
	app.get("/ping", (c) => {
		c.get("logger").info("inside the handler");
		c.get("logger").info({ email: "ada@example.com" }, "with an email");
		return c.text("pong");
	});
	return { app, lines };
}

describe("requestLogger", () => {
	test("logs the request with its id and returns the id in a header", async () => {
		const { app, lines } = appWithCapturedLogs();
		const response = await app.request("/ping");
		const id = response.headers.get("x-request-id");
		expect(id).toBeTruthy();
		const done = lines.find((line) => line.msg === "request completed");
		expect(done).toMatchObject({
			reqId: id,
			method: "GET",
			path: "/ping",
			status: 200,
		});
	});

	test("keeps an incoming request id and passes it to the handler's logger", async () => {
		const { app, lines } = appWithCapturedLogs();
		await app.request("/ping", { headers: { "x-request-id": "abc-123" } });
		expect(
			lines.find((line) => line.msg === "inside the handler"),
		).toMatchObject({ reqId: "abc-123" });
	});

	test("never writes the authorization or cookie header", async () => {
		const { app, lines } = appWithCapturedLogs();
		await app.request("/ping", {
			headers: { authorization: "Bearer s3cret", cookie: "session=t0ken" },
		});
		const output = JSON.stringify(lines);
		expect(output).not.toContain("s3cret");
		expect(output).not.toContain("t0ken");
	});

	test("records the client IP truncated", async () => {
		const { app, lines } = appWithCapturedLogs();
		await app.request("/ping", {
			headers: { "x-forwarded-for": "203.0.113.42, 10.0.0.1" },
		});
		expect(
			lines.find((line) => line.msg === "request completed"),
		).toMatchObject({ ip: "203.0.113.0" });
	});

	test("replaces an incoming request id that is too long or has odd characters", async () => {
		const { app } = appWithCapturedLogs();
		const response = await app.request("/ping", {
			headers: { "x-request-id": `bad id <script>${"x".repeat(100)}` },
		});
		expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
	});

	test("ignores x-forwarded-for unless the proxy is trusted", async () => {
		const { app, lines } = appWithCapturedLogs({ trustProxy: false });
		await app.request("/ping", {
			headers: { "x-forwarded-for": "203.0.113.42" },
		});
		const done = lines.find((line) => line.msg === "request completed");
		expect(done?.ip).toBeUndefined();
	});

	test("never writes an email, even at the top level of a log call", async () => {
		const { app, lines } = appWithCapturedLogs();
		await app.request("/ping");
		expect(JSON.stringify(lines)).not.toContain("ada@example.com");
	});
});

describe("trace id", () => {
	const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";

	test("keeps the trace id of a valid traceparent, logs it and returns it", async () => {
		const { app, lines } = appWithCapturedLogs();
		const response = await app.request("/ping", {
			headers: { traceparent: `00-${TRACE}-00f067aa0ba902b7-01` },
		});
		expect(response.headers.get("x-trace-id")).toBe(TRACE);
		expect(lines.find((l) => l.msg === "inside the handler")).toMatchObject({
			traceId: TRACE,
		});
	});

	test("generates a trace id when the header is absent, malformed or all zeros", async () => {
		const { app } = appWithCapturedLogs();
		for (const traceparent of [
			undefined,
			"garbage",
			`00-${"0".repeat(32)}-00f067aa0ba902b7-01`,
		]) {
			const response = await app.request("/ping", {
				headers: traceparent ? { traceparent } : {},
			});
			expect(response.headers.get("x-trace-id")).toMatch(/^[\da-f]{32}$/);
			expect(response.headers.get("x-trace-id")).not.toBe("0".repeat(32));
		}
	});
});
