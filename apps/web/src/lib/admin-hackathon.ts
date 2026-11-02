/** Sum of the judging weights; the form blocks saving unless it is 100 (#127). */
export function criteriaTotal(criteria: readonly { weight: number }[]) {
	return criteria.reduce((total, { weight }) => total + weight, 0);
}

const pad = (value: number) => String(value).padStart(2, "0");

/** An ISO instant as the value of `<input type="datetime-local">`, in the reader's zone. */
export function toLocalInput(iso: string | null) {
	if (!iso) {
		return "";
	}
	const date = new Date(iso);
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The reverse: a `datetime-local` value (reader's zone) back to an ISO instant, `null` if empty. */
export function fromLocalInput(value: string) {
	if (!value) {
		return null;
	}
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const stable = (value: unknown): unknown =>
	Array.isArray(value)
		? value.map(stable)
		: value && typeof value === "object"
			? Object.fromEntries(
					Object.entries(value)
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([key, item]) => [key, stable(item)]),
				)
			: value;

/** Whether the draft differs from what was loaded, whatever the order of the keys. */
export function isDirty(original: unknown, draft: unknown) {
	return JSON.stringify(stable(original)) !== JSON.stringify(stable(draft));
}

/** What the edit form holds: the Hackathon as typed, dates in the reader's zone (#338). */
export type HackathonDraft = {
	name: string;
	/** Slug of the validated Organization that lists it (#257). */
	organizationSlug: string;
	summary: string;
	teamMin: number;
	teamMax: number;
	sourceNote: string;
	/** Teams and submissions run on CodeSphere (false: the event registers elsewhere). */
	teamsEnabled: boolean;
	milestones: {
		key: string;
		label: string;
		startsAt: string;
		endsAt: string;
	}[];
	prizes: {
		label: string;
		amount: string;
		conditions: string;
	}[];
	criteria: {
		label: string;
		weight: number;
		scoredBy: "jury" | "public" | "peers";
	}[];
};

type HackathonLike = {
	name: string;
	organizationSlug: string | null;
	summary: string;
	teamMin: number;
	teamMax: number;
	sourceNote: string | null;
	teamsEnabled: boolean;
	milestones: {
		key: string;
		label: string;
		startsAt: string;
		endsAt: string | null;
	}[];
	prizes: {
		label: string;
		amount: string | null;
		conditions: string | null;
	}[];
	criteria: HackathonDraft["criteria"];
};

/** The form's starting point for a Hackathon. */
export function draftOf(hackathon: HackathonLike): HackathonDraft {
	return {
		name: hackathon.name,
		organizationSlug: hackathon.organizationSlug ?? "",
		summary: hackathon.summary,
		teamMin: hackathon.teamMin,
		teamMax: hackathon.teamMax,
		sourceNote: hackathon.sourceNote ?? "",
		teamsEnabled: hackathon.teamsEnabled,
		milestones: hackathon.milestones.map((m) => ({
			key: m.key,
			label: m.label,
			startsAt: toLocalInput(m.startsAt),
			endsAt: toLocalInput(m.endsAt),
		})),
		prizes: hackathon.prizes.map((p) => ({
			label: p.label,
			amount: p.amount ?? "",
			conditions: p.conditions ?? "",
		})),
		criteria: hackathon.criteria.map((c) => ({
			label: c.label,
			weight: c.weight,
			scoredBy: c.scoredBy,
		})),
	};
}

/**
 * The `update` call for a draft. A step without a start date is dropped; empty prize amounts and
 * conditions become null. `organizer: false` leaves the organizer out (an Organization cannot
 * change it).
 */
export function updateOf(
	hackathon: { slug: string; version: number },
	draft: HackathonDraft,
	{ organizer }: { organizer: boolean },
) {
	return {
		slug: hackathon.slug,
		expectedVersion: hackathon.version,
		name: draft.name,
		organizationSlug: organizer
			? draft.organizationSlug || undefined
			: undefined,
		summary: draft.summary,
		teamMin: draft.teamMin,
		teamMax: draft.teamMax,
		sourceNote: draft.sourceNote.trim() || null,
		teamsEnabled: draft.teamsEnabled,
		milestones: draft.milestones.flatMap((m) => {
			const startsAt = fromLocalInput(m.startsAt);
			return startsAt
				? [
						{
							key: m.key,
							label: m.label,
							startsAt,
							endsAt: fromLocalInput(m.endsAt),
						},
					]
				: [];
		}),
		prizes: draft.prizes.map((p) => ({
			label: p.label,
			amount: p.amount.trim() || null,
			conditions: p.conditions.trim() || null,
		})),
		criteria: draft.criteria,
	};
}

/** Whether every prize has a label (the API refuses an empty one). */
export function prizesComplete(prizes: readonly { label: string }[]) {
	return prizes.every((p) => p.label.trim().length > 0);
}
