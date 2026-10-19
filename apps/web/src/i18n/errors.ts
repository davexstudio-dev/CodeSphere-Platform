// Standard oRPC error codes that the UI can translate (spec §3). The message key lives in
// messages/<locale>.json under "errors"; anything else falls back to the generic message.
export const ERROR_CODES = [
	"UNAUTHORIZED",
	"FORBIDDEN",
	"PRIVILEGE_REQUIRED",
	"NOT_FOUND",
	"CONFLICT",
	"BAD_REQUEST",
	"TOO_MANY_REQUESTS",
	"INTERNAL_SERVER_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function toErrorCode(code: string | undefined): ErrorCode {
	return ERROR_CODES.find((known) => known === code) ?? "INTERNAL_SERVER_ERROR";
}

// Network failures and non-oRPC throws carry no code, so they read as the generic message.
export function errorCodeOf(error: unknown): ErrorCode {
	const code =
		typeof error === "object" && error !== null && "code" in error
			? String(error.code)
			: undefined;
	return toErrorCode(code);
}

/** Key under the admin screens' error messages for a failed admin call: shared by every admin page. */
export function adminErrorKey(
	error: unknown,
): "forbidden" | "conflict" | "notFound" | "generic" {
	switch (errorCodeOf(error)) {
		case "FORBIDDEN":
			return "forbidden";
		case "CONFLICT":
			return "conflict";
		case "NOT_FOUND":
			return "notFound";
		default:
			return "generic";
	}
}
