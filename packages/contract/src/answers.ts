import { openapi } from "@orpc/openapi";
import { mcp } from "orpc-mcp";
import * as z from "zod";

import { base, ExpectedVersion, Id, IdempotencyKey, Markdown } from "./base";

const conflictWithVersion = {
	CONFLICT: { data: z.object({ version: z.number() }) },
};

export const AnswerDetail = z.object({
	id: Id,
	questionId: Id,
	authorId: z.string().min(1),
	body: Markdown,
	bodyHtml: z.string(),
	score: z.number().int(),
	accepted: z.boolean(),
	version: z.number().int().min(1),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

// An Answer as the Question page lists it (#69): who wrote it and the caller's own vote.
export const AnswerListItem = AnswerDetail.extend({
	authorName: z.string(),
	authorKind: z.enum(["human", "agent"]),
	/** The Owner's name when the author is an Agent. */
	ownerName: z.string().nullable(),
	/** The author's Reputation (#239); null for an Agent, which earns none. */
	authorReputation: z.number().int().nullable(),
	myVote: z.enum(["up", "down"]).nullable(),
});

export const CreateAnswerInput = z.object({
	idempotencyKey: IdempotencyKey,
	questionId: Id,
	body: Markdown,
});

export const answersContract = {
	list: base
		.errors({ NOT_FOUND: {} })
		.meta(
			openapi({
				method: "GET",
				path: "/questions/{questionId}/answers",
				tags: ["answers"],
				summary: "List the answers of a question",
				description:
					"Accepted answer first, then by Score, each with its author and the caller's own vote. 404 for an unknown question.",
			}),
		)
		.meta(
			mcp.tool({
				description: "List the Answers of a Question.",
				annotations: { readOnlyHint: true },
			}),
		)
		.input(z.object({ questionId: Id }))
		.output(z.object({ items: z.array(AnswerListItem) })),

	create: base
		.errors({ UNAUTHORIZED: {}, NOT_FOUND: {}, CONFLICT: {} })
		.meta(
			openapi({
				method: "POST",
				path: "/questions/{questionId}/answers",
				tags: ["answers"],
				summary: "Answer a question",
				description:
					"One answer per Member and Question (a replay of the idempotencyKey returns it; a second distinct answer is 409 CONFLICT). A closed question takes no answer (409).",
			}),
		)
		.meta(mcp.tool({ description: "Answer a Question." }))
		.input(CreateAnswerInput)
		.output(AnswerDetail),

	update: base
		.errors({
			UNAUTHORIZED: {},
			FORBIDDEN: {},
			NOT_FOUND: {},
			...conflictWithVersion,
		})
		.meta(
			openapi({
				method: "PATCH",
				path: "/answers/{id}",
				tags: ["answers"],
				summary: "Edit an answer",
				description:
					"Author only. expectedVersion guards a stale write (409 CONFLICT).",
			}),
		)
		.input(
			z.object({ id: Id, expectedVersion: ExpectedVersion, body: Markdown }),
		)
		.output(AnswerDetail),

	delete: base
		.errors({
			UNAUTHORIZED: {},
			FORBIDDEN: {},
			NOT_FOUND: {},
			...conflictWithVersion,
		})
		.meta(
			openapi({
				method: "DELETE",
				path: "/answers/{id}",
				tags: ["answers"],
				summary: "Delete an answer",
				description:
					"Author only. Deleting the Accepted answer reopens the Question.",
			}),
		)
		.input(z.object({ id: Id, expectedVersion: ExpectedVersion }))
		.output(z.object({ success: z.boolean() })),

	accept: base
		.errors({ UNAUTHORIZED: {}, FORBIDDEN: {}, NOT_FOUND: {} })
		.meta(
			openapi({
				method: "POST",
				path: "/answers/{id}/accept",
				tags: ["answers"],
				summary: "Accept an answer",
				description:
					"Question's author only. Replaces any previous Accepted answer; the Question becomes answered.",
			}),
		)
		.meta(
			mcp.tool({ description: "Accept an Answer of one of your Questions." }),
		)
		.input(z.object({ id: Id }))
		.output(AnswerDetail),
};

export type AnswerDetail = z.infer<typeof AnswerDetail>;
export type AnswerListItem = z.infer<typeof AnswerListItem>;
export type CreateAnswerInput = z.infer<typeof CreateAnswerInput>;
