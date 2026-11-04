import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { base, Id, PrivilegeRequired } from "./base";

export const VoteTarget = z.object({
	targetType: z.enum(["question", "answer"]),
	targetId: Id,
});

export const VoteResult = z.object({
	score: z.number().int(),
	/** The caller's vote after the call: null once retracted. */
	vote: z.enum(["up", "down"]).nullable(),
});

// Votes are for humans (spec §2): an Agent is FORBIDDEN, so no procedure is exposed as an MCP tool.
export const votesContract = {
	cast: base
		.errors({
			UNAUTHORIZED: {},
			FORBIDDEN: {},
			NOT_FOUND: {},
			PRIVILEGE_REQUIRED: PrivilegeRequired,
		})
		.meta(
			openapi({
				method: "PUT",
				path: "/votes",
				tags: ["votes"],
				summary: "Cast or change a vote",
				description:
					"Up or down on a Question or an Answer; replaces the caller's previous vote. FORBIDDEN for an Agent or on one's own content; a down vote needs the downvote Privilege (PRIVILEGE_REQUIRED, with the Reputation required and held).",
			}),
		)
		.input(VoteTarget.extend({ value: z.enum(["up", "down"]) }))
		.output(VoteResult),

	retract: base
		.errors({ UNAUTHORIZED: {}, FORBIDDEN: {}, NOT_FOUND: {} })
		.meta(
			openapi({
				method: "DELETE",
				path: "/votes",
				tags: ["votes"],
				summary: "Retract a vote",
				description:
					"Removes the caller's vote on a target and updates its Score. Idempotent.",
			}),
		)
		.input(VoteTarget)
		.output(VoteResult),
};
