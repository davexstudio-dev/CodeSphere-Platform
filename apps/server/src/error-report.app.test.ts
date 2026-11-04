// Unexpected failures outside oRPC are logged, reported with the trace id and answered without detail (#253).
import { describe, expect, test } from "bun:test";
import { createLogger, type ErrorReporter } from "@codesphere/logger";
import { HTTPException } from "hono/http-exception";

import { createApp } from "./app";

const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";

function appWith(
	reporter?: ErrorReporter,
	failure: Error = new Error("db password is hunter2"),
) {
	return createApp({
		// The auth handler is the failing part: it stands for any uncaught error.
		auth: {
			api: { getSession: async () => null },
			handler: async () => {
				throw failure;
			},
		} as never,
		db: {} as never,
		logger: createLogger({ level: "silent" }),
		corsOrigin: "http://localhost:3001",
		trustProxy: false,
		release: { version: "test", commit: "test" },
		apiDocs: false,
		reporter,
	});
}

describe("uncaught errors", () => {
	test("are reported with the trace id and answered without detail", async () => {
		const captured: { error: unknown; traceId: string; path: string }[] = [];
		const app = appWith({
			capture: (error, context) =>
				captured.push({ error, traceId: context.traceId, path: context.path }),
		});
		const response = await app.request("/api/auth/sign-in", {
			method: "POST",
			headers: { traceparent: `00-${TRACE}-00f067aa0ba902b7-01` },
		});
		expect(response.status).toBe(500);
		expect(response.headers.get("x-trace-id")).toBe(TRACE);
		const body = await response.json();
		expect(body).toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
			data: { traceId: TRACE },
		});
		expect(JSON.stringify(body)).not.toContain("hunter2");
		expect(captured).toEqual([
			{ error: expect.any(Error), traceId: TRACE, path: "/api/auth/sign-in" },
		]);
	});

	test("still answer 500 when the tracker throws or none is configured", async () => {
		const throwing = appWith({
			capture: () => {
				throw new Error("tracker down");
			},
		});
		expect(
			(await throwing.request("/api/auth/x", { method: "POST" })).status,
		).toBe(500);
		expect(
			(await appWith().request("/api/auth/x", { method: "POST" })).status,
		).toBe(500);
	});

	test("keep a deliberate HTTP answer and do not report it", async () => {
		const captured: unknown[] = [];
		const app = appWith(
			{ capture: (error) => captured.push(error) },
			new HTTPException(413, { message: "too large" }),
		);
		const response = await app.request("/api/auth/x", { method: "POST" });
		expect(response.status).toBe(413);
		expect(captured).toHaveLength(0);
	});
});
