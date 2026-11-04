import type { ErrorReporter, Logger } from "@codesphere/logger";

type RequestFacts = {
	traceId?: string;
	requestId?: string;
	method: string;
	path: string;
};

/**
 * Hands an unexpected error to the tracker with the request's ids. A broken tracker is logged and
 * swallowed: it must never replace the failure being handled.
 */
export function reportRequestError(
	reporter: ErrorReporter | undefined,
	logger: Logger,
	request: RequestFacts,
	error: unknown,
): void {
	try {
		reporter?.capture(error, {
			traceId: request.traceId ?? "unknown",
			requestId: request.requestId ?? "unknown",
			method: request.method,
			path: request.path,
		});
	} catch (reportFailure) {
		logger.warn({ err: reportFailure }, "error report failed");
	}
}
