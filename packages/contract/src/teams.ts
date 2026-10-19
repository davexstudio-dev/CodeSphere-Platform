import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { base, HttpUrl, PageInput } from "./base";

// Teams and Submissions of a Hackathon (#261, decision #228).

export const TEAM_NAME_MAX = 60;

export const TeamMember = z.object({
	id: z.string(),
	name: z.string(),
	isCaptain: z.boolean(),
});

export const Submission = z.object({
	id: z.string(),
	teamId: z.string(),
	teamName: z.string(),
	members: z.array(z.string()),
	title: z.string(),
	description: z.string(),
	/** Sanitized HTML of the description. */
	descriptionHtml: z.string(),
	repoUrl: z.string(),
	demoUrl: z.string(),
	videoUrl: z.string().nullable(),
	tags: z.array(z.string()),
	version: z.number().int(),
	updatedAt: z.iso.datetime(),
	/** True once the submission deadline passed: no edit is possible any more. */
	frozen: z.boolean(),
});

export const Team = z.object({
	id: z.string(),
	hackathonSlug: z.string(),
	name: z.string(),
	captainId: z.string(),
	members: z.array(TeamMember),
	maxMembers: z.number().int(),
	/** The invitation link's token: shown to the captain only. */
	inviteToken: z.string().nullable(),
	/** Members invited by name who have not answered: shown to the captain only. */
	pendingInvites: z.array(z.string()),
	/** Joining and leaving are possible until the registration deadline. */
	registrationOpen: z.boolean(),
	submissionOpen: z.boolean(),
	submission: Submission.nullable(),
});

export const TeamInvitation = z.object({
	teamId: z.string(),
	teamName: z.string(),
	hackathonSlug: z.string(),
	invitedByName: z.string(),
});

export const SaveSubmissionInput = z.object({
	teamId: z.uuid(),
	title: z.string().trim().min(3).max(140),
	description: z.string().trim().min(20).max(6000),
	repoUrl: HttpUrl.max(2048),
	demoUrl: HttpUrl.max(2048),
	videoUrl: HttpUrl.max(2048).nullable().optional(),
	tags: z
		.array(z.string().toLowerCase().trim().min(1).max(40))
		.max(5)
		.default([]),
	/** Version the editor saw: a stale one is CONFLICT. Omitted on the first save. */
	expectedVersion: z.number().int().min(1).optional(),
});

// The refusals a Member can run into. Business refusals are CONFLICT (HTTP 409) with a `reason`, so
// they are not mistaken for server errors: CLOSED (a deadline passed), ALREADY_IN_TEAM, TEAM_FULL.
export const TeamConflict = z.object({
	reason: z
		.enum([
			"closed",
			"already_in_team",
			"team_full",
			"name_taken",
			"ambiguous",
			"version",
		])
		.optional(),
});

const memberErrors = {
	UNAUTHORIZED: {},
	FORBIDDEN: {},
	NOT_FOUND: {},
	CONFLICT: { data: TeamConflict },
} as const;
const TeamRef = z.object({ teamId: z.uuid() });

export const teamsContract = {
	mine: base
		.errors({ UNAUTHORIZED: {}, NOT_FOUND: {} })
		.meta(
			openapi({
				method: "GET",
				path: "/hackathons/{slug}/team",
				tags: ["teams"],
				summary: "My team in a Hackathon",
				description:
					"The signed-in Member's Team for this Hackathon, or null. Humans only.",
			}),
		)
		.input(z.object({ slug: z.string() }))
		.output(Team.nullable()),
	create: base
		.errors(memberErrors)
		.input(
			z.object({
				slug: z.string(),
				name: z.string().trim().min(2).max(TEAM_NAME_MAX),
			}),
		)
		.output(Team),
	joinByLink: base
		.errors(memberErrors)
		.input(z.object({ token: z.string().trim().min(10).max(80) }))
		.output(Team),
	invite: base
		.errors(memberErrors)
		.input(TeamRef.extend({ name: z.string().trim().min(2).max(120) }))
		.output(Team),
	invitations: base
		.errors({ UNAUTHORIZED: {} })
		.input(z.object({}))
		.output(z.object({ items: z.array(TeamInvitation) })),
	respond: base
		.errors(memberErrors)
		.input(TeamRef.extend({ accept: z.boolean() }))
		.output(z.object({ team: Team.nullable() })),
	leave: base
		.errors(memberErrors)
		.input(TeamRef)
		.output(z.object({ success: z.boolean() })),
	removeMember: base
		.errors(memberErrors)
		.input(TeamRef.extend({ memberId: z.string() }))
		.output(Team),
	rotateLink: base.errors(memberErrors).input(TeamRef).output(Team),
	disband: base
		.errors(memberErrors)
		.input(TeamRef)
		.output(z.object({ success: z.boolean() })),
	saveSubmission: base
		.errors(memberErrors)
		.input(SaveSubmissionInput)
		.output(Team),
	/** The public gallery: only after the submission deadline, when the submissions are frozen. */
	gallery: base
		.errors({ NOT_FOUND: {} })
		.meta(
			openapi({
				method: "GET",
				path: "/hackathons/{slug}/submissions",
				tags: ["teams"],
				summary: "Submission gallery",
				description:
					"The frozen submissions of a Hackathon, once its submission deadline has passed; empty before. Public.",
			}),
		)
		.input(PageInput.extend({ slug: z.string() }))
		.output(
			z.object({
				open: z.boolean(),
				items: z.array(Submission),
				nextCursor: z.string().nullable(),
			}),
		),
};

export const FlaggedSubmission = z.object({
	id: z.string(),
	teamName: z.string(),
	title: z.string(),
	repoUrl: z.string(),
	earlyCommitAt: z.iso.datetime().nullable(),
});

const adminErrors = { UNAUTHORIZED: {}, FORBIDDEN: {}, NOT_FOUND: {} } as const;

export const teamsAdminContract = {
	/** Reads each repository's first commit and flags those that precede the Hackathon's opening. */
	checkRepositories: base
		.errors(adminErrors)
		.input(z.object({ slug: z.string() }))
		.output(
			z.object({
				checked: z.number().int(),
				flagged: z.number().int(),
				unchecked: z.number().int(),
			}),
		),
	flagged: base
		.errors(adminErrors)
		.input(z.object({ slug: z.string() }))
		.output(z.object({ items: z.array(FlaggedSubmission) })),
};

export type Team = z.infer<typeof Team>;
export type Submission = z.infer<typeof Submission>;
