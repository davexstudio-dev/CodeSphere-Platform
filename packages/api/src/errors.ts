import { DatabaseUnavailableError } from "@codesphere/db";
import { ORPCError } from "@orpc/server";

import { impl } from "./index";

// An unexpected failure is logged with the request's logger and answered as the contract's
// INTERNAL_SERVER_ERROR (spec §3): no detail, only the request id to quote to support.
// Errors the procedures throw on purpose (typed codes) pass through unchanged.
export const unexpectedErrors = impl.middleware(async ({ context, next }) => {
	try {
		return await next();
	} catch (error) {
		if (error instanceof ORPCError) {
			throw error;
		}
		if (error instanceof DatabaseUnavailableError) {
			context.logger.warn({ err: error }, "database unavailable");
			throw new ORPCError("SERVICE_UNAVAILABLE");
		}
		context.logger.error({ err: error }, "procedure failed");
		try {
			context.reportError?.(error);
		} catch (reportFailure) {
			// A broken tracker must not turn a logged failure into a different one.
			context.logger.warn({ err: reportFailure }, "error report failed");
		}
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			data: { requestId: context.requestId, traceId: context.traceId },
		});
	}
});
