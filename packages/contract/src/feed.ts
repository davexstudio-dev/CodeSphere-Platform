import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { base, PageInput } from "./base";
import { QuestionListItem } from "./questions";
import { WatchItem } from "./watch";

export const ForYouInput = PageInput;

// `snapshotAt` pins the page set: Questions asked after it stay out of later pages, so the order
// does not shift while the Member scrolls. It is also carried inside `nextCursor`.
export const ForYouPage = z.object({
	items: z.array(QuestionListItem),
	nextCursor: z.string().nullable(),
	snapshotAt: z.iso.datetime(),
	/** True when the Member follows no Tag: the feed falls back to the hottest Questions overall. */
	fallback: z.boolean(),
});

// For humans only (spec §2): an Agent gets FORBIDDEN, and the procedure is not an MCP tool.
// The single « Pour toi » feed (#256): Questions and watch items ranked together. Each card says why
// it is there; `value` is the Tag in the Tag reasons.
export const FeedReason = z.object({
	code: z.enum([
		"followed_tag",
		"learned_tag",
		"language",
		"african",
		"trending",
	]),
	value: z.string().optional(),
});

const MixedBase = {
	reasons: z.array(FeedReason).min(1),
	/** Source key for « Moins comme ça » on a Source (a watch item only). */
	sourceKey: z.string().nullable(),
	sourceName: z.string().nullable(),
};

export const MixedItem = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("question"),
		question: QuestionListItem,
		...MixedBase,
	}),
	z.object({ kind: z.literal("watch"), item: WatchItem, ...MixedBase }),
]);

export const MixedFeedInput = PageInput.extend({
	/** The reader's interface language, favoured unless their preference says otherwise. */
	language: z.enum(["fr", "en"]).optional(),
});

export const MixedFeedPage = z.object({
	items: z.array(MixedItem),
	nextCursor: z.string().nullable(),
	snapshotAt: z.iso.datetime(),
	/** False when personalisation is off: hot score on the followed Tags only. */
	personalized: z.boolean(),
	/** True when the Member follows no Tag and personalisation is off: the hottest overall. */
	fallback: z.boolean(),
});

export const FeedPreferences = z.object({
	personalization: z.boolean(),
	language: z.enum(["fr", "en"]).nullable(),
	muted: z.array(
		z.object({
			kind: z.enum(["tag", "source"]),
			key: z.string(),
			label: z.string(),
		}),
	),
});

const MuteTarget = z.object({
	kind: z.enum(["tag", "source"]),
	key: z.string().trim().min(1).max(200),
});

const humansOnly = { UNAUTHORIZED: {}, FORBIDDEN: {} } as const;

export const feedContract = {
	mixed: base
		.errors(humansOnly)
		.meta(openapi({ method: "GET", path: "/feed/mixed", tags: ["feed"] }))
		.input(MixedFeedInput)
		.output(MixedFeedPage),
	preferences: base
		.errors(humansOnly)
		.meta(openapi({ method: "GET", path: "/feed/preferences", tags: ["feed"] }))
		.input(z.object({}))
		.output(FeedPreferences),
	updatePreferences: base
		.errors(humansOnly)
		.input(
			z.object({
				personalization: z.boolean().optional(),
				language: z.enum(["fr", "en"]).nullable().optional(),
			}),
		)
		.output(FeedPreferences),
	/** « Moins comme ça »: hides a Tag or a Source from the feed. */
	mute: base.errors(humansOnly).input(MuteTarget).output(FeedPreferences),
	unmute: base.errors(humansOnly).input(MuteTarget).output(FeedPreferences),
	forYou: base
		.errors({ UNAUTHORIZED: {}, FORBIDDEN: {} })
		.meta(openapi({ method: "GET", path: "/feed/for-you", tags: ["feed"] }))
		.input(ForYouInput)
		.output(ForYouPage),
};

export type ForYouPage = z.infer<typeof ForYouPage>;

export type MixedFeedPage = z.infer<typeof MixedFeedPage>;
export type FeedPreferences = z.infer<typeof FeedPreferences>;
export type MixedItem = z.infer<typeof MixedItem>;
