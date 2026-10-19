import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { base } from "./base";

export const CommunitySnapshot = z.object({
	/** UTC day the figures were computed for, `YYYY-MM-DD`. */
	day: z.string(),
	computedAt: z.date(),
	activeMembers: z.number().int(),
	questions: z.number().int(),
	/** 0 to 1. */
	answerRate: z.number(),
	/** Null with no answered Question. */
	medianFirstAnswerMinutes: z.number().int().nullable(),
	/** Share of answered Questions with an Accepted answer, 0 to 1. */
	acceptanceRate: z.number(),
	/** Countries with at least 5 Members; smaller ones are neither counted nor shown. */
	countries: z.number().int(),
});

export const communityContract = {
	snapshot: base
		.meta(
			openapi({
				method: "GET",
				path: "/community/snapshot",
				tags: ["community"],
				summary: "Daily community figures",
				description:
					"Active Members (30 days), Questions, answer rate, median time to first Answer, acceptance rate and the number of countries with at least 5 Members. Computed once a day (UTC) and identical for every visitor. Aggregates only. Public.",
			}),
		)
		.output(CommunitySnapshot),
};
