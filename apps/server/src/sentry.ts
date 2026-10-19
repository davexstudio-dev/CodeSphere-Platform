import type { ErrorReporter } from "@codesphere/logger";
import * as Sentry from "@sentry/bun";

import { ENV } from "./env.server";

/**
 * Sentry for the Bun server (#253). Opt-in: without SENTRY_DSN nothing is initialised and the
 * API runs with no tracker. Every report carries the trace id and request id as tags, the same
 * values as the log lines and the `x-trace-id` / `x-request-id` response headers.
 */
export function createSentryReporter(): ErrorReporter | undefined {
	if (!ENV.SENTRY_DSN) {
		return undefined;
	}
	Sentry.init({
		dsn: ENV.SENTRY_DSN,
		environment: ENV.NODE_ENV,
		release: `${ENV.OTEL_SERVICE_NAME}@${ENV.APP_VERSION}`,
		// Errors only: performance is measured elsewhere. PII is off by default in the SDK.
		tracesSampleRate: 0,
	});
	return {
		capture(error, context) {
			Sentry.withScope((scope) => {
				scope.setTag("trace_id", context.traceId);
				scope.setTag("request_id", context.requestId);
				scope.setTag("http.method", context.method);
				scope.setContext("request", { path: context.path });
				Sentry.captureException(error);
			});
		},
	};
}
