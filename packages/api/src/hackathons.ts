import { type Hackathon, JudgingCriterion } from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import {
	hackathon,
	hackathonCriterion,
	hackathonMilestone,
	hackathonPrize,
} from "@codesphere/db/schema/hackathons";
import { organization } from "@codesphere/db/schema/organizations";
import { asc, eq, inArray } from "drizzle-orm";
import type * as z from "zod";

type HackathonRow = typeof hackathon.$inferSelect;
type Children = {
	organization: { name: string; slug: string | null };
	milestones: {
		key: string;
		label: string;
		startsAt: Date;
		endsAt: Date | null;
		position: number;
	}[];
	prizes: {
		label: string;
		amount: string | null;
		conditions: string | null;
		position: number;
	}[];
	criteria: {
		label: string;
		weight: number;
		scoredBy: string;
		position: number;
	}[];
};

const byPosition = (a: { position: number }, b: { position: number }) =>
	a.position - b.position;

/** The public shape of a Hackathon (spec §2): children in their display order, ISO dates. */
export function toHackathon(
	row: HackathonRow,
	children: Children,
): z.infer<typeof Hackathon> {
	return {
		slug: row.slug,
		name: row.name,
		organizer: children.organization.name,
		organizationSlug: children.organization.slug,
		summary: row.summary,
		teamMin: row.teamMin,
		teamMax: row.teamMax,
		milestones: [...children.milestones].sort(byPosition).map((m) => ({
			key: m.key,
			label: m.label,
			startsAt: m.startsAt.toISOString(),
			endsAt: m.endsAt ? m.endsAt.toISOString() : null,
		})),
		prizes: [...children.prizes].sort(byPosition).map((p) => ({
			label: p.label,
			amount: p.amount,
			conditions: p.conditions,
		})),
		criteria: [...children.criteria].sort(byPosition).map((c) => ({
			label: c.label,
			weight: c.weight,
			// A bad value in the database fails loudly (INTERNAL_SERVER_ERROR) instead of being guessed.
			scoredBy: JudgingCriterion.shape.scoredBy.parse(c.scoredBy),
		})),
		opensAt: row.opensAt ? row.opensAt.toISOString() : null,
		sourceUrl: row.sourceUrl,
		sourceNote: row.sourceNote,
		verifiedAt: row.verifiedAt.toISOString(),
		version: row.version,
	};
}

/** Loads Hackathons with their Milestones, Prizes and criteria in four queries, no join fan-out. */
export async function loadHackathons(
	db: Database,
	filter?: { slug: string },
	limit = 20,
) {
	const joined = await db
		.select({
			row: hackathon,
			orgName: organization.name,
			orgSlug: organization.slug,
			orgStatus: organization.status,
		})
		.from(hackathon)
		.innerJoin(organization, eq(organization.id, hackathon.organizationId))
		.where(filter ? eq(hackathon.slug, filter.slug) : undefined)
		.orderBy(asc(hackathon.createdAt))
		.limit(limit);
	if (!joined.length) {
		return [];
	}
	const rows = joined.map((j) => j.row);
	const ids = rows.map((r) => r.id);
	const [milestones, prizes, criteria] = await Promise.all([
		db
			.select()
			.from(hackathonMilestone)
			.where(inArray(hackathonMilestone.hackathonId, ids)),
		db
			.select()
			.from(hackathonPrize)
			.where(inArray(hackathonPrize.hackathonId, ids)),
		db
			.select()
			.from(hackathonCriterion)
			.where(inArray(hackathonCriterion.hackathonId, ids)),
	]);
	return joined.map(({ row, orgName, orgSlug, orgStatus }) =>
		toHackathon(row, {
			// The profile link only exists while the Organization's profile is public.
			organization: {
				name: orgName,
				slug: orgStatus === "validated" ? orgSlug : null,
			},
			milestones: milestones.filter((m) => m.hackathonId === row.id),
			prizes: prizes.filter((p) => p.hackathonId === row.id),
			criteria: criteria.filter((c) => c.hackathonId === row.id),
		}),
	);
}
