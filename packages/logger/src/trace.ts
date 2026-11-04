// W3C Trace Context: version-traceid-parentid-flags, all lowercase hex.
const TRACEPARENT =
	/^(?!ff)[\da-f]{2}-([\da-f]{32})-(?!0{16})[\da-f]{16}-[\da-f]{2}$/;
const NO_TRACE = "0".repeat(32);

/** The trace id of an incoming `traceparent`, or a fresh 128-bit id when absent or malformed. */
export function resolveTraceId(traceparent: string | undefined): string {
	const incoming = traceparent?.trim().toLowerCase().match(TRACEPARENT)?.[1];
	if (incoming && incoming !== NO_TRACE) {
		return incoming;
	}
	return crypto.randomUUID().replaceAll("-", "");
}
