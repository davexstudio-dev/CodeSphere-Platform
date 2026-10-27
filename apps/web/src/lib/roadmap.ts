import type { Locale } from "next-intl";

import data from "./roadmap.generated.json";

export type RoadmapStatus = "delivered" | "in_progress" | "planned";

type Text = { fr: string; en: string };

export type RoadmapItem = {
	text: string;
	status: RoadmapStatus;
	ref: string | null;
};

export type RoadmapSection = {
	id: string;
	title: string;
	target: string | null;
	items: RoadmapItem[];
};

const pick = (text: Text, locale: Locale) =>
	locale === "fr" ? text.fr : text.en;

/** The roadmap in one language, from the generated copy of `docs/roadmap.yaml`. */
export function roadmapIn(locale: Locale) {
	return {
		sections: data.sections.map(
			(section): RoadmapSection => ({
				id: section.id,
				title: pick(section.title, locale),
				target:
					"target" in section && section.target
						? pick(section.target, locale)
						: null,
				items: section.items.map((item) => ({
					text: pick(item, locale),
					status: item.status as RoadmapStatus,
					ref: "ref" in item && typeof item.ref === "string" ? item.ref : null,
				})),
			}),
		),
		notDoing: data.not_doing.map((item) => pick(item, locale)),
	};
}

export type RoadmapProgress = {
	delivered: number;
	inProgress: number;
	planned: number;
	total: number;
	/** Share of the lines already delivered, 0 to 100, rounded; 0 for an empty list. */
	percent: number;
};

/** How far a list of roadmap lines has come (#252): the counts per status and the delivered share. */
export function progressOf(items: readonly { status: RoadmapStatus }[]) {
	const count = (status: RoadmapStatus) =>
		items.filter((item) => item.status === status).length;
	const delivered = count("delivered");
	return {
		delivered,
		inProgress: count("in_progress"),
		planned: count("planned"),
		total: items.length,
		percent:
			items.length === 0 ? 0 : Math.round((delivered / items.length) * 100),
	} satisfies RoadmapProgress;
}
