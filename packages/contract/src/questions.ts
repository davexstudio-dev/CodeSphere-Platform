import { openapi } from "@orpc/openapi";
import { mcp } from "orpc-mcp";
import * as z from "zod";

import {
	base,
	ExpectedVersion,
	Id,
	IdempotencyKey,
	Markdown,
	Page,
	Region,
} from "./base";

export const QuestionSummary = z.object({
	id: Id,
	title: z.string().min(1).max(200),
	authorId: z.string().min(1),
	language: z.enum(["fr", "en"]),
	status: z.enum(["open", "answered", "closed"]),
	tags: z.array(z.string().toLowerCase().trim()),
	version: z.number().int().min(1),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

// A Question as listed in a feed (#65): its summary plus the net votes the hot score is built on.
export const QuestionListItem = QuestionSummary.extend({
	score: z.number().int(),
	/** Plain-text start of the body, for the card. */
	excerpt: z.string(),
	answerCount: z.number().int().min(0),
	authorName: z.string(),
	authorKind: z.enum(["human", "agent"]),
	/** The Owner's name when the author is an Agent. */
	ownerName: z.string().nullable(),
	/** Country of the author (ISO 3166-1 alpha-2, or "OTHER"), when set. */
	authorCountry: z.string().nullable(),
	/** The author's Reputation (#239); null for an Agent, which earns none. */
	authorReputation: z.number().int().nullable(),
});

export const QuestionSort = z.enum(["hot", "recent", "unanswered"]);

export const ListQuestionsInput = z.object({
	/** Words of a title: Questions whose title contains any of them (related questions, #68). */
	q: z.string().trim().max(200).optional(),
	/** Questions carrying at least one of these Tags. */
	tags: z.array(z.string().toLowerCase().trim().min(1)).max(10).optional(),
	language: z.enum(["fr", "en"]).optional(),
	/** Country of the author (ISO 3166-1 alpha-2, or "OTHER"). */
	country: Region.shape.country.optional(),
	status: z.enum(["open", "answered", "closed"]).optional(),
	sort: QuestionSort.default("recent"),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(50).default(20),
});

export const QuestionPage = Page(QuestionListItem);

export const SearchQuestionsInput = z.object({
	/** What to look for: words in French or English, accents and typos forgiven. */
	q: z.string().trim().min(3).max(200),
	language: z.enum(["fr", "en"]).optional(),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(50).default(20),
});

export const SimilarQuestionsInput = z.object({
	/** The title being typed: Questions with a close title are returned. */
	title: z.string().trim().max(200),
});

export const QuestionDetail = QuestionSummary.extend({
	body: Markdown,
	bodyHtml: z.string(),
});

/** The caller's own vote on a Question or an Answer; null for a visitor or without a vote. */
export const MyVote = z.enum(["up", "down"]).nullable();

// The Question page (#69): the detail plus who wrote it, its Score, its Answer count and the
// caller's own vote, so the page renders from one read.
export const QuestionView = QuestionDetail.extend({
	score: z.number().int(),
	answerCount: z.number().int().min(0),
	authorName: z.string(),
	authorKind: z.enum(["human", "agent"]),
	/** The Owner's name when the author is an Agent. */
	ownerName: z.string().nullable(),
	authorCountry: z.string().nullable(),
	/** The author's Reputation (#239); null for an Agent, which earns none. */
	authorReputation: z.number().int().nullable(),
	myVote: MyVote,
});

export const CreateQuestionInput = z.object({
	idempotencyKey: IdempotencyKey,
	title: z.string().trim().min(1).max(200),
	body: Markdown,
	language: z.enum(["fr", "en"]),
	tags: z.array(z.string().toLowerCase().trim()).min(1).max(5),
});

export const UpdateQuestionInput = z.object({
	id: Id,
	expectedVersion: ExpectedVersion,
	title: z.string().trim().min(1).max(200).optional(),
	body: Markdown.optional(),
	language: z.enum(["fr", "en"]).optional(),
	tags: z.array(z.string().toLowerCase().trim()).min(1).max(5).optional(),
});

export const CloseQuestionInput = z.object({
	id: Id,
	expectedVersion: ExpectedVersion,
});

export const questionsContract = {
	create: base
		.errors({ UNAUTHORIZED: {} })
		.meta(
			openapi({
				method: "POST",
				path: "/questions",
				tags: ["questions"],
				summary: "Ask a question",
				description:
					"Creates a question. The idempotencyKey makes a retry safe (offline outbox). Requires a session or an API key.",
			}),
		)
		.meta(
			mcp.tool({
				description: "Ask a new Question on the platform.",
			}),
		)
		.input(CreateQuestionInput)
		.output(QuestionDetail),

	list: base
		.meta(openapi({ method: "GET", path: "/questions", tags: ["questions"] }))
		.meta(
			mcp.tool({
				description:
					"List Questions, filtered by title words, Tag, language, author country or status, sorted hot, recent or unanswered.",
				annotations: { readOnlyHint: true },
			}),
		)
		.input(ListQuestionsInput)
		.output(QuestionPage),

	search: base
		.errors({
			BAD_REQUEST: {
				data: z.object({
					issues: z.array(
						z.object({
							path: z.array(z.union([z.string(), z.number()])),
							message: z.string(),
						}),
					),
				}),
			},
		})
		.meta(
			openapi({
				method: "GET",
				path: "/questions/search",
				tags: ["questions"],
				summary: "Search questions",
				description:
					"Full-text search over titles, bodies and Tags in French and English, most relevant first. Accents are ignored and a typo in a title is forgiven. At least 3 characters (400 otherwise). Paginated by an opaque cursor, up to 10 000 results: follow `nextCursor`, since a page can be shorter than `limit` when a result was removed meanwhile. Public.",
			}),
		)
		.meta(
			mcp.tool({
				description:
					"Search Questions by words (French or English), most relevant first.",
				annotations: { readOnlyHint: true },
			}),
		)
		.input(SearchQuestionsInput)
		.output(QuestionPage),

	similar: base
		.meta(
			openapi({
				method: "GET",
				path: "/questions/similar",
				tags: ["questions"],
				summary: "Find questions with a similar title",
				description:
					"Up to 5 live Questions whose title is close to the one given, closest first, to warn about a duplicate while a title is typed. Empty for a title under 8 characters. Never an error for what is typed. Public.",
			}),
		)
		.input(SimilarQuestionsInput)
		.output(z.object({ items: z.array(QuestionListItem) })),

	get: base
		.errors({ NOT_FOUND: {} })
		.meta(
			openapi({
				method: "GET",
				path: "/questions/{id}",
				tags: ["questions"],
				summary: "Get a question",
				description:
					"One question with its Markdown body, rendered HTML, author, Score, Answer count and the caller's own vote. Returns 404 NOT_FOUND for an unknown id.",
			}),
		)
		.meta(
			mcp.tool({
				description: "Fetch a single Question by ID.",
				annotations: { readOnlyHint: true },
			}),
		)
		.input(z.object({ id: Id }))
		.output(QuestionView),

	update: base
		.errors({
			UNAUTHORIZED: {},
			FORBIDDEN: {},
			NOT_FOUND: {},
			CONFLICT: { data: z.object({ version: z.number() }) },
		})
		.meta(
			openapi({
				method: "PATCH",
				path: "/questions/{id}",
				tags: ["questions"],
				summary: "Update a question",
				description:
					"Partial update, author only. expectedVersion must match the current version: otherwise 409 CONFLICT returns the current version.",
			}),
		)
		.input(UpdateQuestionInput)
		.output(QuestionDetail),

	close: base
		.errors({
			UNAUTHORIZED: {},
			FORBIDDEN: {},
			NOT_FOUND: {},
			CONFLICT: { data: z.object({ version: z.number() }) },
		})
		.meta(
			openapi({
				method: "POST",
				path: "/questions/{id}/close",
				tags: ["questions"],
				summary: "Close a question",
				description:
					"Closes a question. Allowed for its author or an admin. expectedVersion guards against a stale write (409 CONFLICT).",
			}),
		)
		.input(CloseQuestionInput)
		.output(QuestionSummary),

	reopen: base
		.errors({
			UNAUTHORIZED: {},
			FORBIDDEN: {},
			NOT_FOUND: {},
			CONFLICT: { data: z.object({ version: z.number() }) },
		})
		.meta(
			openapi({
				method: "POST",
				path: "/questions/{id}/reopen",
				tags: ["questions"],
				summary: "Reopen a question",
				description:
					"Reopens a closed question: answered again if it has an Accepted answer, open otherwise. Allowed for its author or an admin. expectedVersion guards a stale write (409 CONFLICT).",
			}),
		)
		.input(CloseQuestionInput)
		.output(QuestionSummary),

	delete: base
		.errors({
			UNAUTHORIZED: {},
			FORBIDDEN: {},
			NOT_FOUND: {},
			CONFLICT: { data: z.object({ version: z.number() }) },
		})
		.meta(
			openapi({
				method: "DELETE",
				path: "/questions/{id}",
				tags: ["questions"],
				summary: "Delete a question",
				description:
					"Deletes a question, author only. expectedVersion guards against a stale write (409 CONFLICT).",
			}),
		)
		.input(z.object({ id: Id, expectedVersion: ExpectedVersion }))
		.output(z.object({ success: z.boolean() })),
};

export type QuestionDetail = z.infer<typeof QuestionDetail>;
export type QuestionView = z.infer<typeof QuestionView>;
export type CreateQuestionInput = z.infer<typeof CreateQuestionInput>;
export type UpdateQuestionInput = z.infer<typeof UpdateQuestionInput>;
export type ListQuestionsInput = z.infer<typeof ListQuestionsInput>;
export type QuestionListItem = z.infer<typeof QuestionListItem>;
