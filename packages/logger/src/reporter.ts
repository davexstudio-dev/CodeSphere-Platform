/** Where an unexpected error came from, so a report can be joined with the request's log lines. */
export type ErrorContext = {
	traceId: string;
	requestId: string;
	method: string;
	path: string;
};

/**
 * Port to an error tracker (Sentry, #253). The API depends on this, not on a vendor SDK, so a
 * runtime without the SDK (the Worker) or a test can plug its own.
 */
export type ErrorReporter = {
	capture(error: unknown, context: ErrorContext): void;
};

export const noopReporter: ErrorReporter = { capture() {} };
