import type { Milestone } from "@codesphere/contract";
import type { z } from "zod";

type MilestoneData = z.infer<typeof Milestone>;

export const HACKATHON_TABS = [
	"overview",
	"timeline",
	"prizes",
	"rules",
	"judging",
	"discussion",
	"team",
	"gallery",
] as const;
export type HackathonTab = (typeof HACKATHON_TABS)[number];

export function isHackathonTab(value: string | null): value is HackathonTab {
	return HACKATHON_TABS.some((tab) => tab === value);
}

export type MilestoneState = "done" | "current" | "upcoming";

/**
 * Where each Milestone stands at `now`: done once it ended (or started, for a single date), current
 * while it runs. When none runs, the next one to come is current, so the timeline always points
 * at what comes next.
 */
export function milestoneStates(
	milestones: readonly MilestoneData[],
	now: Date,
): MilestoneState[] {
	const t = now.getTime();
	const states = milestones.map((m): MilestoneState => {
		const start = Date.parse(m.startsAt);
		const end = m.endsAt ? Date.parse(m.endsAt) : start;
		if (t >= end && (m.endsAt || t > start)) return "done";
		if (t >= start) return "current";
		return "upcoming";
	});
	if (!states.includes("current")) {
		const next = states.indexOf("upcoming");
		if (next !== -1) states[next] = "current";
	}
	return states;
}

/** Milestones in date order, whatever order the seed or an Admin stored them in. */
export function sortedMilestones(
	milestones: readonly MilestoneData[],
): MilestoneData[] {
	return [...milestones].sort(
		(a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
	);
}
