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
