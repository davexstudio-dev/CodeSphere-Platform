import * as z from "zod";

// The « Pour toi » feed's ranking (#256, decision #226):
//
//   score = hot x (1 + affinity) x language bonus x Africa bonus
//
// and never more than `maxRun` items in a row of the same Source or the same Tag. The coefficients
// are configuration (`FEED_RANKING`, a JSON object), not code.

export type FeedRanking = {
	/** Bonus for an item in the Member's language. */
	languageBonus: number;
	/** Bonus for an item from an African source or author. */
	africaBonus: number;
	/** Most items in a row sharing a Source or a Tag. */
	maxRun: number;
	/** Affinity a followed Tag gives. */
	followedAffinity: number;
	/** Affinity a learned Tag weight of 1 gives (the weight is capped at 10). */
	learnedAffinity: number;
	/** Ceiling of an item's total affinity. */
	affinityCap: number;
	/** Only items from the last N days are ranked: older ones have a negligible hot score. */
	windowDays: number;
};

export const DEFAULT_FEED_RANKING: FeedRanking = {
	languageBonus: 1.3,
	africaBonus: 1.2,
	maxRun: 2,
	followedAffinity: 1,
	learnedAffinity: 0.1,
	affinityCap: 3,
	windowDays: 120,
};

const Overrides = z
	.object({
		languageBonus: z.number().min(1).max(10),
		africaBonus: z.number().min(1).max(10),
		maxRun: z.number().int().min(1).max(20),
		followedAffinity: z.number().min(0).max(10),
		learnedAffinity: z.number().min(0).max(10),
		affinityCap: z.number().min(0).max(20),
		windowDays: z.number().int().min(1).max(3650),
	})
	.partial()
	.strict();

/** The coefficients in force: the defaults, overridden by `FEED_RANKING`. A typo stops the deployment. */
export function parseFeedRanking(raw: string | undefined): FeedRanking {
	if (!raw?.trim()) {
		return DEFAULT_FEED_RANKING;
	}
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		throw new Error("FEED_RANKING is not valid JSON");
	}
	const parsed = Overrides.safeParse(json);
	if (!parsed.success) {
		throw new Error(
			`FEED_RANKING is invalid: ${parsed.error.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; ")}`,
		);
	}
	return { ...DEFAULT_FEED_RANKING, ...parsed.data };
}

/** ISO 3166-1 alpha-2 codes of the African countries: what the Africa bonus recognises. */
export const AFRICAN_COUNTRIES = [
	"DZ",
	"AO",
	"BJ",
	"BW",
	"BF",
	"BI",
	"CV",
	"CM",
	"CF",
	"TD",
	"KM",
	"CG",
	"CD",
	"CI",
	"DJ",
	"EG",
	"GQ",
	"ER",
	"SZ",
	"ET",
	"GA",
	"GM",
	"GH",
	"GN",
	"GW",
	"KE",
	"LS",
	"LR",
	"LY",
	"MG",
	"MW",
	"ML",
	"MR",
	"MU",
	"MA",
	"MZ",
	"NA",
	"NE",
	"NG",
	"RW",
	"ST",
	"SN",
	"SC",
	"SL",
	"SO",
	"ZA",
	"SS",
	"SD",
	"TZ",
	"TG",
	"TN",
	"UG",
	"ZM",
	"ZW",
] as const;

export type Candidate = {
	id: string;
	/** Keys that must not run more than `maxRun` times in a row: its Source and its Tags. */
	keys: string[];
};

/**
 * Reorders a page so no more than `maxRun` consecutive items share a key. Greedy: the next item is
 * the best-ranked one that does not break the rule, or, when every remaining one would, the best
 * ranked of them (the rule gives way before an item is dropped). Nothing is skipped or duplicated.
 */
export function diversify<T extends Candidate>(
	items: T[],
	maxRun: number,
): T[] {
	const remaining = [...items];
	const out: T[] = [];
	while (remaining.length > 0) {
		const recent = out.slice(-maxRun);
		const breaks = (candidate: T) =>
			recent.length === maxRun &&
			candidate.keys.some((key) => recent.every((r) => r.keys.includes(key)));
		const index = remaining.findIndex((candidate) => !breaks(candidate));
		const [picked] = remaining.splice(index === -1 ? 0 : index, 1);
		out.push(picked as T);
	}
	return out;
}

export type ReasonCode =
	| "followed_tag"
	| "learned_tag"
	| "language"
	| "african"
	| "trending";

export type Reason = { code: ReasonCode; value?: string };

/** Why an item is in the feed, most specific first; `trending` when nothing personal applies. */
export function reasonsFor(signals: {
	followedTags: string[];
	learnedTags: string[];
	language: boolean;
	african: boolean;
}): Reason[] {
	const reasons: Reason[] = [];
	const followed = signals.followedTags[0];
	if (followed) {
		reasons.push({ code: "followed_tag", value: followed });
	}
	const learned = signals.learnedTags.find((t) => t !== followed);
	if (learned) {
		reasons.push({ code: "learned_tag", value: learned });
	}
	if (signals.language) {
		reasons.push({ code: "language" });
	}
	if (signals.african) {
		reasons.push({ code: "african" });
	}
	return reasons.length > 0 ? reasons : [{ code: "trending" }];
}
