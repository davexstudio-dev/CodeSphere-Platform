import { openapi } from "@orpc/openapi";
import { mcp } from "orpc-mcp";
import * as z from "zod";

import { base, ExpectedVersion, Id, Page, PageInput, Timestamp } from "./base";
import { Hackathon, JudgingCriterion, Milestone, Prize } from "./hackathons";
import { jobsAdminContract } from "./jobs";
import { MemberSummary } from "./members";
import { organizationsAdminContract } from "./organizations";
import { vitalsAdminContract } from "./vitals";
import { watchAdminContract } from "./watch";

export const AuditEvent = z.object({
	id: z.string(),
	actorId: z.string().nullable(),
	action: z.string(),
	targetType: z.string(),
	targetId: z.string().nullable(),
	/** Names of the fields that changed and, for a suspension, the reason: never personal values. */
	details: z
		.object({
			fields: z.array(z.string()).optional(),
			reason: z.string().max(500).optional(),
		})
		.nullable(),
	createdAt: Timestamp,
});

/** A Reputation event the anti-farming rules cancelled (#241), with who gave it to whom. */
export const ReputationFlag = z.object({
	id: z.string(),
	reason: z.enum(["new_account", "repeat_voter", "daily_cap"]),
	/** A vote, or an acceptance (whose "voter" is then the Question's author). */
	cause: z.enum(["vote", "accept"]),
	/** The points that were not counted. */
	points: z.number().int(),
	kind: z.string(),
	voter: z.object({ id: z.string(), name: z.string() }),
	author: z.object({ id: z.string(), name: z.string() }),
	targetType: z.enum(["question", "answer"]),
	targetId: z.string(),
	createdAt: Timestamp,
});

export const ReputationFlagFilter = PageInput.extend({
	/** Defaults to `repeat_voter`, the case reported to the Admins; the others are automatic. */
	reason: z.enum(["new_account", "repeat_voter", "daily_cap"]).optional(),
});

export const AuditLogFilter = PageInput.extend({
	/** Exact action, e.g. "hackathon.update". */
	action: z.string().min(1).max(64).optional(),
	actorId: z.string().min(1).optional(),
	targetType: z.string().min(1).max(64).optional(),
});

/**
 * An Admin edit of a Hackathon (#124): every field is optional, a list given replaces the
 * stored one. Milestones keep their keys (the countdowns hang on them): only their label and
 * dates change. A stale `expectedVersion` gets CONFLICT.
 */
export const HackathonUpdate = z
	.object({
		slug: z.string(),
		expectedVersion: ExpectedVersion,
		name: z.string().trim().min(1).max(120).optional(),
		/** Slug of a validated Organization (#257). */
		organizationSlug: z.string().trim().min(1).max(120).optional(),
		summary: z.string().trim().min(1).max(2000).optional(),
		teamMin: z.number().int().min(1).max(50).optional(),
		teamMax: z.number().int().min(1).max(50).optional(),
		sourceUrl: z.url().optional(),
		sourceNote: z.string().trim().max(500).nullable().optional(),
		verifiedAt: Timestamp.optional(),
		milestones: z
			.array(Milestone.extend({ label: z.string().trim().min(1).max(160) }))
			.max(20)
			.optional(),
		prizes: z
			.array(
				Prize.extend({
					label: z.string().trim().min(1).max(160),
					amount: z.string().trim().max(80).nullable(),
					conditions: z.string().trim().max(500).nullable(),
				}),
			)
			.max(20)
			.optional(),
		criteria: z
			.array(
				JudgingCriterion.extend({
					label: z.string().trim().min(1).max(160),
					weight: z.number().int().min(0).max(100),
				}),
			)
			.max(20)
			.refine(
				(criteria) =>
					criteria.reduce((total, { weight }) => total + weight, 0) === 100,
				"The criteria weights must total 100.",
			)
			.optional(),
	})
	.refine(
		({ teamMin, teamMax }) =>
			teamMin === undefined || teamMax === undefined || teamMin <= teamMax,
		{ message: "teamMin cannot exceed teamMax.", path: ["teamMin"] },
	)
	.refine(
		({ milestones }) =>
			!milestones ||
			milestones.every(
				({ startsAt, endsAt }) =>
					!endsAt || Date.parse(endsAt) >= Date.parse(startsAt),
			),
		{
			message: "A Milestone cannot end before it starts.",
			path: ["milestones"],
		},
	);

/** Staff writes. Every one needs a staff role (super_admin, admin or moderator), see requireAdmin. */
const staffErrors = {
	UNAUTHORIZED: {},
	FORBIDDEN: {},
	NOT_FOUND: {},
	CONFLICT: { data: z.object({ version: z.number() }) },
};

/** A Member as the moderation screen sees them: the email is for the Admin only (#123). */
export const AdminMember = MemberSummary.extend({
	email: z.string(),
	role: z.enum(["super_admin", "admin", "moderator", "member"]),
	createdAt: Timestamp,
	suspendedAt: Timestamp.nullable(),
	suspensionReason: z.string().nullable(),
});

export const AdminMemberFilter = PageInput.extend({
	status: z.enum(["active", "suspended"]).optional(),
	/** Matches the name or the email, case-insensitively. */
	q: z.string().trim().min(1).max(100).optional(),
});

/** Why a Member is suspended: required, shown in the audit log (#116). */
export const SuspensionReason = z.string().trim().min(3).max(280);

/** An official Tag as the admin sees it (#125). */
export const AdminTag = z.object({
	id: Id,
	name: z.string(),
	version: z.number().int().min(1),
	/** Questions that carry the Tag. */
	questionCount: z.number().int().min(0),
	/** Slug of the Hackathon that owns the Tag, which then cannot be renamed or deleted. */
	ownerHackathon: z.string().nullable(),
	/** Reserved by an Admin: it can be neither renamed nor deleted. */
	reserved: z.boolean(),
	/** Relied on by the product itself: always reserved, the reservation cannot be lifted. */
	system: z.boolean(),
});

/** Name of a Tag: normalized (trimmed, lowercase) like the Tags of a Question. */
export const TagName = z.string().trim().toLowerCase().min(1).max(40);

/** Window of the KPI page (#113): the last 7 or 30 days, compared with the window before. */
export const KpiPeriod = z.enum(["7d", "30d"]);

export const KpiMetricId = z.enum([
	"activeMembers",
	"questions",
	"answerRate",
	"medianFirstAnswerMinutes",
	"unanswered",
	"acceptedRate",
	"agentShare",
]);

/**
 * One metric over the window. Rates are between 0 and 1. A value is null when it has no
 * meaning, such as a rate over no Question or a median over no answer.
 */
export const KpiMetric = z.object({
	id: KpiMetricId,
	value: z.number().nullable(),
	/** Same metric over the window just before, for the change. */
	previous: z.number().nullable(),
	/** The window cut into equal buckets, oldest first. */
	trend: z.array(z.number().nullable()),
});

export const KpiReport = z.object({
	period: KpiPeriod,
	from: Timestamp,
	to: Timestamp,
	metrics: z.array(KpiMetric),
});

export const SocialPlatform = z.enum(["bluesky", "linkedin", "x"]);

/** What an Admin shares to the official accounts: a public Question (by id) or Hackathon (by slug). */
export const SocialPublishInput = z.object({
	type: z.enum(["question", "hackathon"]),
	/** A Question's id, or a Hackathon's slug. */
	id: z.string().trim().min(1).max(120),
	platform: SocialPlatform,
	/** The sentence before the link; the title of the content when omitted. */
	text: z.string().trim().min(1).max(200).optional(),
});

export const SocialPublication = z.object({
	platform: SocialPlatform,
	type: z.enum(["question", "hackathon"]),
	id: z.string(),
	/** `processing` and `unknown` mean the platform may already hold the post: never re-sent blindly. */
	state: z.enum(["published", "processing", "failed", "unknown"]),
	postUrl: z.string().nullable(),
	message: z.string().nullable(),
	/** A failed post nothing was sent for: publishing it again is safe. */
	retryable: z.boolean(),
});

export const SocialOAuthPlatform = z.enum(["linkedin", "x"]);

/** An official account as the back-office sees it: never a token, only who and until when. */
export const SocialAccount = z.object({
	platform: SocialOAuthPlatform,
	/** The OAuth application of this platform is set up on this deployment. */
	configured: z.boolean(),
	connected: z.boolean(),
	accountName: z.string().nullable(),
	/** When the access token expires; it renews by itself before, when the platform allows. */
	expiresAt: Timestamp.nullable(),
	/** `reconnect-required`: the platform refused the stored grant; connect the account again. */
	status: z.enum(["connected", "reconnect-required"]).nullable(),
	connectedAt: Timestamp.nullable(),
});

export const SocialStatus = z.object({
	/** Platforms that have credentials on this deployment; empty when the feature is off. */
	platforms: z.array(SocialPlatform),
	/** X and LinkedIn accounts an Admin connects through OAuth (#266); empty where it is not set up. */
	accounts: z.array(SocialAccount),
});

const socialErrors = {
	UNAUTHORIZED: {},
	FORBIDDEN: {},
	NOT_FOUND: {},
	CONFLICT: {},
	SERVICE_UNAVAILABLE: {},
};

const tagErrors = {
	UNAUTHORIZED: {},
	FORBIDDEN: {},
	NOT_FOUND: {},
	CONFLICT: {},
};

export const adminContract = {
	tags: {
		list: base
			.errors({ UNAUTHORIZED: {}, FORBIDDEN: {} })
			.input(z.object({}))
			.output(z.object({ items: z.array(AdminTag) })),
		create: base
			.errors({ UNAUTHORIZED: {}, FORBIDDEN: {}, CONFLICT: {} })
			.input(z.object({ name: TagName, reserved: z.boolean().default(false) }))
			.output(AdminTag),
		/** Reserves a Tag (kept as is) or lifts the reservation; a system Tag stays reserved. */
		setReserved: base
			.errors(tagErrors)
			.input(
				z.object({
					id: Id,
					reserved: z.boolean(),
					expectedVersion: ExpectedVersion,
				}),
			)
			.output(AdminTag),
		rename: base
			.errors(tagErrors)
			.input(
				z.object({ id: Id, name: TagName, expectedVersion: ExpectedVersion }),
			)
			.output(AdminTag),
		delete: base
			.errors(tagErrors)
			.input(z.object({ id: Id }))
			.output(z.object({ success: z.boolean() })),
	},
	social: {
		// Not exposed over REST or MCP: connecting an account is an Admin's decision.
		connect: base
			.errors(socialErrors)
			.input(z.object({ platform: SocialOAuthPlatform }))
			.output(z.object({ authorizationUrl: z.string() })),
		completeConnect: base
			.errors(socialErrors)
			.input(z.object({ callbackUrl: z.string().max(2048) }))
			.output(
				z.object({ platform: SocialOAuthPlatform, accountName: z.string() }),
			),
		disconnect: base
			.errors(socialErrors)
			.input(z.object({ platform: SocialOAuthPlatform }))
			.output(z.object({ success: z.boolean() })),
		status: base
			.errors({ UNAUTHORIZED: {}, FORBIDDEN: {} })
			.input(z.object({}))
			.output(SocialStatus),
		// Not exposed over REST or MCP: a publication is an Admin's decision, made from the back-office.
		publish: base
			.errors(socialErrors)
			.input(SocialPublishInput)
			.output(SocialPublication),
	},
	kpi: base
		.errors({ UNAUTHORIZED: {}, FORBIDDEN: {} })
		.meta(
			openapi({
				method: "GET",
				path: "/admin/kpi",
				tags: ["admin"],
				summary: "Community KPIs",
				description:
					"Activity over the last 7 or 30 days, with the previous window and a trend: active Members, Questions, answer rate, median time to first answer, unanswered Questions, accepted rate and agent share. Requires a staff role.",
			}),
		)
		.input(z.object({ period: KpiPeriod }))
		.output(KpiReport),
	members: {
		list: base
			.errors({ UNAUTHORIZED: {}, FORBIDDEN: {} })
			.meta(openapi({ method: "GET", path: "/admin/members", tags: ["admin"] }))
			.input(AdminMemberFilter)
			.output(Page(AdminMember)),
		suspend: base
			.errors({ UNAUTHORIZED: {}, FORBIDDEN: {}, NOT_FOUND: {}, CONFLICT: {} })
			.input(z.object({ id: z.string(), reason: SuspensionReason }))
			.output(AdminMember),
		reactivate: base
			.errors({ UNAUTHORIZED: {}, FORBIDDEN: {}, NOT_FOUND: {}, CONFLICT: {} })
			.input(z.object({ id: z.string() }))
			.output(AdminMember),
	},
	jobs: jobsAdminContract,
	organizations: organizationsAdminContract,
	webVitals: vitalsAdminContract,
	watch: watchAdminContract,
	auditLog: {
		list: base
			.errors({ UNAUTHORIZED: {}, FORBIDDEN: {} })
			.meta(
				openapi({
					method: "GET",
					path: "/admin/audit-log",
					tags: ["admin"],
					summary: "List the audit log",
					description:
						"Admin audit log, newest first, filterable by action, actor and target type. Requires a staff role: UNAUTHORIZED without a session, FORBIDDEN without one.",
				}),
			)
			.meta(
				mcp.tool({
					description:
						"List the admin audit log, newest first. Requires the admin role.",
					annotations: { readOnlyHint: true },
				}),
			)
			.input(AuditLogFilter)
			.output(Page(AuditEvent)),
	},
	reputationFlags: {
		list: base
			.errors({ UNAUTHORIZED: {}, FORBIDDEN: {} })
			.meta(
				openapi({
					method: "GET",
					path: "/admin/reputation-flags",
					tags: ["admin"],
					summary: "List cancelled Reputation events",
					description:
						"Reputation events the anti-farming rules cancelled, newest first: by default the repeated votes of one voter on one author (repeat_voter). They stay in the journal, voided, and count for nothing. Requires a staff role.",
				}),
			)
			.input(ReputationFlagFilter)
			.output(Page(ReputationFlag)),
	},
	hackathons: {
		update: base
			.errors(staffErrors)
			.meta(
				openapi({
					method: "PATCH",
					path: "/admin/hackathons/{slug}",
					tags: ["admin"],
					summary: "Update a hackathon",
					description:
						"Edits a hackathon: its fields and, when given, its milestones, prizes and judging criteria (a list replaces the stored one; criteria weights must total 100). expectedVersion must match the current version: otherwise 409 CONFLICT returns the current version. Requires a staff role. Audited.",
				}),
			)
			.input(HackathonUpdate)
			.output(Hackathon),
	},
	agents: {
		reactivate: base
			.errors(staffErrors)
			.meta(
				openapi({
					method: "POST",
					path: "/admin/agents/{id}/reactivate",
					tags: ["admin"],
					summary: "Bring back a paused agent",
					description:
						"Enables the Agent's key again and ends its pause, however many times it was paused (the Owner can lift only the first pause). Requires a staff role. Audited.",
				}),
			)
			.input(z.object({ id: z.string().min(1) }))
			.output(z.object({ success: z.boolean() })),
	},
	questions: {
		remove: base
			.errors(staffErrors)
			.meta(
				openapi({
					method: "DELETE",
					path: "/admin/questions/{id}",
					tags: ["admin"],
					summary: "Remove a question (moderation)",
					description:
						"Soft-deletes any question, whoever wrote it. expectedVersion must match the current version (409 CONFLICT otherwise). Requires a staff role. Audited.",
				}),
			)
			.input(z.object({ id: Id, expectedVersion: ExpectedVersion }))
			.output(z.object({ success: z.boolean() })),
	},
};
