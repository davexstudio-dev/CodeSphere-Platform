import { openapi } from "@orpc/openapi";
import { mcp } from "orpc-mcp";
import * as z from "zod";

import { base, Page, PageInput, PrivilegeRequired } from "./base";

export const WATCH_SUMMARY_MAX = 300;

export const WatchItem = z.object({
	id: z.string(),
	url: z.string(),
	domain: z.string(),
	title: z.string(),
	/** Plain text, 300 characters at most. */
	summary: z.string(),
	tags: z.array(z.string()),
	language: z.enum(["fr", "en"]),
	/** The item comes from an African source. */
	africanSource: z.boolean(),
	/** The Source's name, null for a proposal. */
	sourceName: z.string().nullable(),
	origin: z.enum(["source", "member", "agent"]),
	/** `pending`: proposed, waiting for a positive human vote or an Admin. */
	visibility: z.enum(["visible", "pending", "removed"]),
	publishedAt: z.date(),
	score: z.number().int(),
	/** The reader's vote, null when they have none. */
	myVote: z.union([z.literal(1), z.literal(-1)]).nullable(),
	/** Kept for later by the reader. */
	saved: z.boolean(),
});

const ItemId = z.object({ itemId: z.uuid() });

const Tag = z.string().toLowerCase().trim().min(1).max(40);

export const SubmitWatchItemInput = z.object({
	url: z.string().trim().max(2048),
	title: z.string().trim().min(1).max(200),
	summary: z.string().trim().max(WATCH_SUMMARY_MAX).default(""),
	tags: z.array(Tag).max(5).default([]),
	language: z.enum(["fr", "en"]),
});

export const WatchItemFilter = PageInput.extend({
	tag: Tag.optional(),
	language: z.enum(["fr", "en"]).optional(),
	african: z.boolean().optional(),
	/** Proposals waiting for a vote: signed-in Members only. */
	pending: z.boolean().optional(),
	/** Only the items the reader kept for later: signed-in Members only. */
	saved: z.boolean().optional(),
});

export const watchContract = {
	list: base
		.meta(
			openapi({
				method: "GET",
				path: "/watch/items",
				tags: ["watch"],
				summary: "Watch feed",
				description:
					"Links worth reading, newest first: items of trusted Sources and proposals that earned a positive human vote or an Admin's approval. `pending` lists the proposals still waiting; `saved` lists the items the reader kept. Public, except those two filters.",
			}),
		)
		.meta(
			mcp.tool({
				description:
					"List the watch feed: links from trusted Sources and approved proposals, filtered by Tag, language or African source.",
				annotations: { readOnlyHint: true },
			}),
		)
		.errors({ UNAUTHORIZED: {} })
		.input(WatchItemFilter)
		.output(Page(WatchItem)),

	submit: base
		.errors({
			UNAUTHORIZED: {},
			FORBIDDEN: {},
			CONFLICT: {},
			PRIVILEGE_REQUIRED: PrivilegeRequired,
		})
		.meta(
			openapi({
				method: "POST",
				path: "/watch/items",
				tags: ["watch"],
				summary: "Propose a link",
				description:
					"Proposes a link to the watch feed: one item per normalized URL (CONFLICT when it exists or was removed), a blocked domain is refused (FORBIDDEN). A Member needs 25 Reputation; everyone, Agents included, is limited to 5 proposals a day. The item waits for a positive human vote or an Admin's approval. Only the link, a title and a summary of 300 characters are kept.",
			}),
		)
		.meta(
			mcp.tool({
				description:
					"Propose a link to the watch feed. Keep the summary under 300 characters; never paste the article.",
			}),
		)
		.input(SubmitWatchItemInput)
		.output(WatchItem),

	vote: base
		.errors({ UNAUTHORIZED: {}, FORBIDDEN: {}, NOT_FOUND: {} })
		.meta(
			openapi({
				method: "PUT",
				path: "/watch/items/{itemId}/vote",
				tags: ["watch"],
				summary: "Vote on a watch item",
				description:
					"Humans only, never on their own proposal. Value 1 or -1, or 0 to retract. A first positive vote makes a proposal visible.",
			}),
		)
		.input(
			ItemId.extend({
				value: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
			}),
		)
		.output(WatchItem),

	save: base
		.errors({ UNAUTHORIZED: {}, FORBIDDEN: {}, NOT_FOUND: {} })
		.meta(
			openapi({
				method: "PUT",
				path: "/watch/items/{itemId}/saved",
				tags: ["watch"],
				summary: "Keep an item for later",
			}),
		)
		.input(ItemId.extend({ saved: z.boolean() }))
		.output(WatchItem),

	report: base
		.errors({
			UNAUTHORIZED: {},
			FORBIDDEN: {},
			NOT_FOUND: {},
			PRIVILEGE_REQUIRED: PrivilegeRequired,
		})
		.input(ItemId.extend({ reason: z.string().trim().min(1).max(300) }))
		.output(z.object({ success: z.boolean() })),
};

// Admin side (#255): the Sources whitelist, the moderation queue and blocked domains.
const adminErrors = { UNAUTHORIZED: {}, FORBIDDEN: {} } as const;

export const WatchSource = z.object({
	id: z.string(),
	name: z.string(),
	feedUrl: z.string(),
	domain: z.string(),
	language: z.enum(["fr", "en"]),
	african: z.boolean(),
	tags: z.array(z.string()),
	active: z.boolean(),
	lastFetchedAt: z.date().nullable(),
	lastError: z.string().nullable(),
	itemCount: z.number().int(),
});

export const WatchReviewItem = WatchItem.extend({
	reports: z.number().int(),
	reasons: z.array(z.string()),
});

export const watchAdminContract = {
	sources: {
		list: base
			.errors(adminErrors)
			.input(z.object({}))
			.output(z.object({ items: z.array(WatchSource) })),
		create: base
			.errors({ ...adminErrors, CONFLICT: {} })
			.input(
				z.object({
					name: z.string().trim().min(1).max(100),
					feedUrl: z.string().trim().url().max(2048),
					language: z.enum(["fr", "en"]),
					african: z.boolean().default(false),
					tags: z.array(Tag).max(5).default([]),
				}),
			)
			.output(WatchSource),
		update: base
			.errors({ ...adminErrors, NOT_FOUND: {} })
			.input(
				z.object({
					id: z.uuid(),
					active: z.boolean().optional(),
					african: z.boolean().optional(),
					tags: z.array(Tag).max(5).optional(),
				}),
			)
			.output(WatchSource),
		/** Removal on a Source's request: its items go, the Source stops, its domain is blocked. */
		remove: base
			.errors({ ...adminErrors, NOT_FOUND: {} })
			.input(z.object({ id: z.uuid() }))
			.output(z.object({ removedItems: z.number().int() })),
	},
	items: {
		/** Reported items first, then proposals waiting for a vote. */
		review: base
			.errors(adminErrors)
			.input(PageInput)
			.output(Page(WatchReviewItem)),
		approve: base
			.errors({ ...adminErrors, NOT_FOUND: {} })
			.input(ItemId)
			.output(z.object({ success: z.boolean() })),
		remove: base
			.errors({ ...adminErrors, NOT_FOUND: {} })
			.input(ItemId.extend({ reason: z.string().trim().min(1).max(300) }))
			.output(z.object({ success: z.boolean() })),
	},
	domains: {
		list: base
			.errors(adminErrors)
			.input(z.object({}))
			.output(
				z.object({
					items: z.array(
						z.object({ domain: z.string(), reason: z.string().nullable() }),
					),
				}),
			),
		/** Blocks a domain and removes its existing items. */
		block: base
			.errors(adminErrors)
			.input(
				z.object({
					domain: z.string().trim().toLowerCase().min(3).max(253),
					reason: z.string().trim().max(300).optional(),
				}),
			)
			.output(z.object({ removedItems: z.number().int() })),
		unblock: base
			.errors(adminErrors)
			.input(
				z.object({ domain: z.string().trim().toLowerCase().min(3).max(253) }),
			)
			.output(z.object({ success: z.boolean() })),
	},
	/** Reads the Sources now, instead of waiting for the next scheduled run. */
	ingest: base
		.errors(adminErrors)
		.input(z.object({}))
		.output(z.object({ sources: z.number().int(), added: z.number().int() })),
};

export type WatchItem = z.infer<typeof WatchItem>;
