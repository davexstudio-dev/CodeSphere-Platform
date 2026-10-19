/** What a dynamic share card (1200x630) shows, cut to fit (#262). Pure, so it is unit-tested. */

export const OG_SIZE = { width: 1200, height: 630 } as const;

const TITLE_MAX = 110;
const TAGS_MAX = 4;
const TAG_MAX = 20;

export type CardInput = {
	title: string;
	/** Tag names of a Question; empty for a Hackathon. */
	tags?: readonly string[];
	/** Net votes of a Question; null where a score has no meaning. */
	score?: number | null;
	/** A line under the title (the organizer of a Hackathon). */
	subtitle?: string | null;
};

export type CardText = {
	title: string;
	tags: string[];
	score: string | null;
	subtitle: string | null;
};

const clip = (text: string, max: number) => {
	const t = text.replace(/\s+/g, " ").trim();
	if (t.length <= max) {
		return t;
	}
	const cut = t.slice(0, max);
	const space = cut.lastIndexOf(" ");
	return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
};

/** The texts of a card: a long title cut on a word, at most four short Tags, a signed score. */
export function cardText({
	title,
	tags,
	score,
	subtitle,
}: CardInput): CardText {
	return {
		title: clip(title, TITLE_MAX),
		tags: (tags ?? [])
			.map((tag) => clip(tag, TAG_MAX))
			.filter(Boolean)
			.slice(0, TAGS_MAX),
		score:
			typeof score === "number" && Number.isFinite(score)
				? `${score > 0 ? "+" : ""}${Math.trunc(score)}`
				: null,
		subtitle: subtitle ? clip(subtitle, 60) : null,
	};
}
