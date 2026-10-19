/** The reason of a Team refusal (CONFLICT with a `reason`, #261), or null. */
export function teamConflictReason(error: unknown): string | null {
	const data =
		typeof error === "object" && error !== null && "data" in error
			? (error as { data?: { reason?: unknown } }).data
			: undefined;
	return typeof data?.reason === "string" ? data.reason : null;
}
