import * as z from "zod";

// Anti-farming rules of the Reputation journal (#241, decision #219). They are applied when a
// vote or an acceptance is settled; a cancelled event stays in the journal, voided, with its reason.

export type FarmingLimits = {
	/** The most Reputation a Member can gain in one (database) day; the rest is voided. */
	dailyGainCap: number;
	/** A vote from an account younger than this earns the author nothing. */
	minAccountAgeDays: number;
	/** The most votes one voter can give one author in the window; the next ones are voided. */
	repeatVoterMax: number;
	repeatWindowDays: number;
};

export const FARMING_LIMITS: FarmingLimits = {
	dailyGainCap: 200,
	minAccountAgeDays: 7,
	repeatVoterMax: 10,
	repeatWindowDays: 30,
};

/** Every rule off: for suites about other features, and for seeding demo content. */
export const NO_FARMING_LIMITS: FarmingLimits = {
	dailyGainCap: Number.POSITIVE_INFINITY,
	minAccountAgeDays: 0,
	repeatVoterMax: Number.POSITIVE_INFINITY,
	repeatWindowDays: 30,
};

export type VoidedReason = "new_account" | "repeat_voter" | "daily_cap";

const Overrides = z
	.object({
		dailyGainCap: z.number().int().min(0).max(1_000_000),
		minAccountAgeDays: z.number().int().min(0).max(365),
		repeatVoterMax: z.number().int().min(1).max(10_000),
		repeatWindowDays: z.number().int().min(1).max(365),
	})
	.partial()
	.strict();

/**
 * The limits in force: the defaults overridden by `FARMING_LIMITS`, a JSON object such as
 * `{"minAccountAgeDays": 0}`. A malformed value throws, so a typo stops the deployment.
 */
export function parseFarmingLimits(raw: string | undefined): FarmingLimits {
	if (!raw?.trim()) {
		return FARMING_LIMITS;
	}
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		throw new Error("FARMING_LIMITS is not valid JSON");
	}
	const parsed = Overrides.safeParse(json);
	if (!parsed.success) {
		throw new Error(
			`FARMING_LIMITS is invalid: ${parsed.error.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; ")}`,
		);
	}
	return { ...FARMING_LIMITS, ...parsed.data };
}
