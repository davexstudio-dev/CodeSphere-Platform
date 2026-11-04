import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { base, Page, PageInput } from "./base";

/** A country with fewer Members than this is not shown publicly (decision #219). */
export const MIN_MEMBERS_PER_COUNTRY = 5;

export const RankedMember = z.object({
	/** Position in this ranking, from 1. Members with the same Reputation are ordered by id. */
	rank: z.number().int().min(1),
	id: z.string(),
	name: z.string(),
	country: z.string().nullable(),
	reputation: z.number().int(),
});

export const CountryReputation = z.object({
	country: z.string(),
	members: z.number().int(),
	/** Sum of the Reputation of the country's Members. */
	reputation: z.number().int(),
});

// Public: Reputation is shown on profiles anyway. Only humans appear (Agents earn none); suspended
// and deleted Members do not.
export const rankingsContract = {
	countries: base
		.meta(
			openapi({
				method: "GET",
				path: "/rankings/countries",
				tags: ["rankings"],
				summary: "Reputation by country",
				description: `Countries with at least ${MIN_MEMBERS_PER_COUNTRY} Members, by total Reputation. A smaller country is left out. Public.`,
			}),
		)
		.output(z.object({ items: z.array(CountryReputation) })),

	byCountry: base
		.meta(
			openapi({
				method: "GET",
				path: "/rankings/countries/{country}",
				tags: ["rankings"],
				summary: "Members of a country by Reputation",
				description: `Highest Reputation first, paginated. Empty for a country with fewer than ${MIN_MEMBERS_PER_COUNTRY} Members. Public.`,
			}),
		)
		.input(PageInput.extend({ country: z.string().trim().min(2).max(5) }))
		.output(Page(RankedMember)),

	byTag: base
		.meta(
			openapi({
				method: "GET",
				path: "/rankings/tags/{tag}",
				tags: ["rankings"],
				summary: "Members by Reputation earned on a Tag",
				description:
					"Reputation earned from Votes and acceptances on Questions and Answers carrying the Tag, highest first, paginated. Only Members with a positive total. Public.",
			}),
		)
		.input(PageInput.extend({ tag: z.string().trim().min(1).max(40) }))
		.output(Page(RankedMember)),
};
