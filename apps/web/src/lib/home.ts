import type { MixedItem, QuestionListItem } from "@codesphere/contract";

// Small rules of the home page (#130), kept out of the components so they are tested alone.

/** The instant submissions close: the `submission_close` Milestone, else the first one. */
export function submissionClose(
	milestones: readonly { key: string; startsAt: string }[],
): string | null {
	const close = milestones.find((m) => m.key === "submission_close");
	return (close ?? milestones[0])?.startsAt ?? null;
}

/** « Bonjour » until 18:00 in the viewer's time, « Bonsoir » after. */
export function greetingKey(hour: number): "morning" | "evening" {
	return hour < 18 ? "morning" : "evening";
}

export function firstName(name: string): string {
	return name.trim().split(/\s+/)[0] ?? "";
}

export type FeedFilter = {
	/** "all", "fr" or "en". */
	language: string;
	/** "all", or an ISO country code / "OTHER". */
	country: string;
	/** The Member's setting (#50): Agents' Questions are left out of the feed. */
	hideAgents: boolean;
};

/**
 * What a feed page shows (#66): each Question once, in order, without Agents' Questions when the
 * Member hides them, and within the language and country filters. The server already applies the
 * filters to « Récents » and « Sans réponse »; « Pour toi » has none, so they apply here.
 */
export function visibleItems<
	T extends {
		id: string;
		authorKind: "human" | "agent";
		language: string;
		authorCountry: string | null;
	},
>(items: readonly T[], filter: FeedFilter): T[] {
	const seen = new Set<string>();
	return items.filter((q) => {
		if (seen.has(q.id)) {
			return false;
		}
		seen.add(q.id);
		return (
			!(filter.hideAgents && q.authorKind === "agent") &&
			(filter.language === "all" || q.language === filter.language) &&
			(filter.country === "all" || q.authorCountry === filter.country)
		);
	});
}

type Entry = {
	kind: "question" | "watch";
	question?: {
		id: string;
		authorKind: "human" | "agent";
		language: string;
		authorCountry: string | null;
	};
	item?: { id: string; language: string };
};

/**
 * What the « Pour toi » feed shows (#256): the rules of `visibleItems` for Questions, and for watch
 * items the language filter (a watch item has no author country, so a country filter leaves it out).
 */
export function visibleEntries<T extends Entry>(
	entries: readonly T[],
	filter: FeedFilter,
): T[] {
	const seen = new Set<string>();
	return entries.filter((entry) => {
		const id = entry.question?.id ?? entry.item?.id ?? "";
		if (seen.has(id)) {
			return false;
		}
		seen.add(id);
		if (entry.kind === "question" && entry.question) {
			return visibleItems([entry.question], filter).length === 1;
		}
		return (
			filter.country === "all" &&
			(filter.language === "all" || entry.item?.language === filter.language)
		);
	});
}

/** A Question as an entry of the shared feed list, with nothing to explain (no ranking on its tab). */
export function toMixed(question: QuestionListItem): MixedItem {
	return {
		kind: "question",
		question,
		reasons: [],
		sourceKey: null,
		sourceName: null,
	};
}
