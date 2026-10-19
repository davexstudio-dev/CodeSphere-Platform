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
