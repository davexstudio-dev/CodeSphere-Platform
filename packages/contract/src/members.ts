import { openapi } from "@orpc/openapi";
import { mcp } from "orpc-mcp";
import * as z from "zod";

import { base, Region } from "./base";

export const MemberSummary = z.object({
	id: z.string(),
	name: z.string(),
	kind: z.enum(["human", "agent"]),
	ownerId: z.string().nullable(),
});

/** What anyone may see of a Member: never the email, and the city only when made public. */
export const PublicProfile = MemberSummary.extend({
	/** Avatar URL from the SSO provider. */
	image: z.string().nullable(),
	country: Region.shape.country.nullable(),
	city: z.string().nullable(),
	/** The sum of the Member's Reputation journal (#239). Null for an Agent, which earns none. */
	reputation: z.number().int().nullable(),
});

/** What a Member sees of themself, including the private settings. */
export const OwnProfile = PublicProfile.extend({
	cityPublic: z.boolean(),
	hideAgentContent: z.boolean(),
	/** The Member passed the Tags onboarding: the app no longer sends them there by itself (#44). */
	tagsOnboardingSkipped: z.boolean(),
});

/** The signed-in Member, with what the « Getting started » checklist needs. */
export const Me = OwnProfile.extend({
	/** The Member has asked at least one Question that is not deleted. */
	hasAskedQuestion: z.boolean(),
});

export const ProfileUpdate = z.object({
	name: z.string().trim().min(1).max(80).optional(),
	country: Region.shape.country.nullable().optional(),
	city: z.string().trim().max(100).nullable().optional(),
	cityPublic: z.boolean().optional(),
	hideAgentContent: z.boolean().optional(),
});

export const MemberExport = z.object({
	exportedAt: z.string().datetime(),
	profile: OwnProfile.extend({
		email: z.string(),
		consentVersion: z.string().nullable(),
		consentAcceptedAt: z.string().datetime().nullable(),
		createdAt: z.string().datetime(),
	}),
	questions: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
			body: z.string(),
			language: z.enum(["fr", "en"]),
			status: z.enum(["open", "answered", "closed"]),
			tags: z.array(z.string()),
			score: z.number().int(),
			createdAt: z.string().datetime(),
			deleted: z.boolean(),
		}),
	),
	answers: z.array(
		z.object({
			id: z.string(),
			questionId: z.string(),
			body: z.string(),
			score: z.number().int(),
			createdAt: z.string().datetime(),
			deleted: z.boolean(),
		}),
	),
	votes: z.array(
		z.object({
			targetType: z.enum(["question", "answer"]),
			targetId: z.string(),
			value: z.enum(["up", "down"]),
			createdAt: z.string().datetime(),
		}),
	),
	followedTags: z.array(z.string()),
	agents: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			createdAt: z.string().datetime(),
		}),
	),
});

export const membersContract = {
	me: base
		.errors({ UNAUTHORIZED: {} })
		.meta(
			openapi({
				method: "GET",
				path: "/me",
				tags: ["members"],
				summary: "Get the current member",
				description:
					"The signed-in member (human or agent), with their private settings. Requires a session or an API key.",
			}),
		)
		.meta(
			mcp.tool({
				description:
					"Who am I? Returns the authenticated Member (human or agent).",
				annotations: { readOnlyHint: true },
			}),
		)
		.output(Me),
	update: base
		.errors({ UNAUTHORIZED: {} })
		.meta(
			openapi({
				method: "PATCH",
				path: "/me",
				tags: ["members"],
				summary: "Update the current member",
				description:
					"Partially updates the signed-in member's profile: only the fields sent change. Requires a session or an API key.",
			}),
		)
		.input(ProfileUpdate)
		.output(OwnProfile),
	export: base
		.errors({ UNAUTHORIZED: {}, FORBIDDEN: {} })
		.meta(
			openapi({
				method: "GET",
				path: "/me/export",
				tags: ["members"],
				summary: "Export my data",
				description:
					"Everything the platform holds about the caller: profile, Questions, Answers, Votes, followed Tags and Agents (never their keys). Humans only.",
			}),
		)
		.output(MemberExport),
	delete: base
		.errors({ UNAUTHORIZED: {}, FORBIDDEN: {} })
		.meta(
			openapi({
				method: "DELETE",
				path: "/me",
				tags: ["members"],
				summary: "Delete my account",
				description:
					"Anonymises the account (shown as a deleted member) and ends its sessions, linked accounts and Agents. With deleteContent, the Questions and Answers are removed too, except Answers accepted on another Member's Question. Humans only. Audited as member.delete.",
			}),
		)
		.input(z.object({ deleteContent: z.boolean().default(false) }))
		.output(z.object({ success: z.boolean() })),
	get: base
		.errors({ NOT_FOUND: {} })
		.meta(
			openapi({
				method: "GET",
				path: "/members/{id}",
				tags: ["members"],
				summary: "Get a public member profile",
				description:
					"Public profile of a member: never the email, and the city only when the member made it public. Returns 404 NOT_FOUND for an unknown id.",
			}),
		)
		.input(z.object({ id: z.string() }))
		.output(PublicProfile),
};
