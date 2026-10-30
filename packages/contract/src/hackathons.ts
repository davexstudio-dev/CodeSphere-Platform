import { openapi } from "@orpc/openapi";
import { mcp } from "orpc-mcp";
import * as z from "zod";

import { base, Page, PageInput, Timestamp } from "./base";

export const Milestone = z.object({
	key: z.string(),
	label: z.string(),
	startsAt: Timestamp,
	endsAt: Timestamp.nullable(),
});

export const Prize = z.object({
	label: z.string(),
	amount: z.string().nullable(),
	conditions: z.string().nullable(),
});

export const JudgingCriterion = z.object({
	label: z.string(),
	/** Share of the final score, in percent; a Hackathon's criteria total 100. */
	weight: z.number().int(),
	scoredBy: z.enum(["jury", "public", "peers"]),
});

/** One way, by hand (#325): a draft is never public; an archived Hackathon leaves the lists. */
export const HackathonStatus = z.enum([
	"draft",
	"published",
	"ended",
	"archived",
]);

export const Hackathon = z.object({
	slug: z.string(),
	name: z.string(),
	/** Name of the Organization that lists it. */
	organizer: z.string(),
	/** Slug of that Organization's public profile; null while it is not public (suspended). */
	organizationSlug: z.string().nullable(),
	summary: z.string(),
	status: HackathonStatus,
	teamMin: z.number().int(),
	teamMax: z.number().int(),
	milestones: z.array(Milestone),
	prizes: z.array(Prize),
	criteria: z.array(JudgingCriterion),
	sourceUrl: z.url(),
	/** Where non-public information came from, shown next to « vérifié le ». */
	sourceNote: z.string().nullable(),
	/** When the Hackathon opens; null when unknown (no repository check then). */
	opensAt: Timestamp.nullable(),
	/** Teams and submissions run on CodeSphere; false when the event registers elsewhere (sourceUrl). */
	teamsEnabled: z.boolean(),
	verifiedAt: Timestamp,
	/** Increments on every edit; an Admin update with a stale version gets CONFLICT. */
	version: z.number().int().min(1),
});

export const hackathonsContract = {
	list: base
		.meta(
			openapi({
				method: "GET",
				path: "/hackathons",
				tags: ["hackathons"],
				summary: "List hackathons",
				description:
					"Hackathons known to CodeSphere, with dates, rules and team size. Public, no authentication.",
			}),
		)
		.meta(
			mcp.tool({
				description:
					"List hackathons (dates, rules, team size) known to CodeSphere.",
				annotations: { readOnlyHint: true },
			}),
		)
		.input(PageInput)
		.output(Page(Hackathon)),
	get: base
		.errors({ NOT_FOUND: {} })
		.meta(
			openapi({
				method: "GET",
				path: "/hackathons/{slug}",
				tags: ["hackathons"],
				summary: "Get a hackathon",
				description:
					"One hackathon by slug, e.g. cadev-2026. Public. Returns 404 NOT_FOUND for an unknown slug.",
			}),
		)
		.meta(
			mcp.tool({
				description: "Get one hackathon by slug, e.g. cadev-2026.",
				annotations: { readOnlyHint: true },
			}),
		)
		.input(z.object({ slug: z.string() }))
		.output(Hackathon),
};
