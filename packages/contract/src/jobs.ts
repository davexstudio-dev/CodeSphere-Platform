import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { base, Page, PageInput, Region } from "./base";

// Job postings and the Talent card (#258, decision #227).

const Tag = z.string().toLowerCase().trim().min(1).max(40);
export const MAX_JOB_TAGS = 5;

export const JobPosting = z.object({
	id: z.string(),
	title: z.string(),
	description: z.string(),
	tags: z.array(z.string()),
	country: z.string(),
	remote: z.boolean(),
	/** Where to apply, outside CodeSphere: a link or an email, exactly one. */
	applyUrl: z.string().nullable(),
	applyEmail: z.string().nullable(),
	organization: z.object({ slug: z.string(), name: z.string() }),
	publishedAt: z.iso.datetime(),
	/** Thirty days after publication: the posting is no longer listed after it. */
	expiresAt: z.iso.datetime(),
	/** The reader applied through CodeSphere; null when they did not. */
	myApplication: z.object({ sharedCard: z.boolean() }).nullable(),
});

export const PublishJobInput = z.object({
	/** Slug of one of the publisher's validated Organizations. */
	organizationSlug: z.string().trim().min(1).max(120),
	title: z.string().trim().min(3).max(140),
	description: z.string().trim().min(20).max(4000),
	tags: z.array(Tag).min(1).max(MAX_JOB_TAGS),
	country: Region.shape.country,
	remote: z.boolean().default(false),
	applyUrl: z.url().max(2048).optional(),
	applyEmail: z.email().max(254).optional(),
});

/** What a recruiter sees of a Member who chose to be seen: no id, no email unless they gave one. */
export const TalentCardView = z.object({
	name: z.string(),
	reputation: z.number().int(),
	/** The Tags the Member earned the most Reputation on. */
	strongestTags: z.array(z.string()),
	country: z.string().nullable(),
	headline: z.string().nullable(),
	/** Link to their code (repository, portfolio). */
	codeUrl: z.string().nullable(),
	/** An address the Member chose to give recruiters. */
	contactEmail: z.string().nullable(),
});

export const OwnTalentCard = z.object({
	/** Off by default. */
	enabled: z.boolean(),
	/** « Ouvert aux contacts »: listed for validated Organizations. */
	openToContact: z.boolean(),
	headline: z.string().nullable(),
	codeUrl: z.string().nullable(),
	contactEmail: z.string().nullable(),
	/** What a recruiter would see, read live from the Member's activity. */
	preview: TalentCardView,
});

export const UpdateTalentCardInput = z.object({
	enabled: z.boolean().optional(),
	openToContact: z.boolean().optional(),
	headline: z.string().trim().max(140).nullable().optional(),
	codeUrl: z.url().max(2048).nullable().optional(),
	contactEmail: z.email().max(254).nullable().optional(),
});

export const JobApplicant = z.object({
	name: z.string(),
	appliedAt: z.iso.datetime(),
	/** Present when the Member shared their card for this posting. */
	card: TalentCardView.nullable(),
});

const JobId = z.object({ id: z.uuid() });
const humans = { UNAUTHORIZED: {}, FORBIDDEN: {} } as const;

export const jobsContract = {
	list: base
		.meta(
			openapi({
				method: "GET",
				path: "/jobs",
				tags: ["jobs"],
				summary: "Job postings",
				description:
					"Live postings of validated Organizations, newest first, filtered by country, Tag or remote. A posting expires after 30 days. Public.",
			}),
		)
		.input(
			PageInput.extend({
				country: Region.shape.country.optional(),
				tag: Tag.optional(),
				remote: z.boolean().optional(),
			}),
		)
		.output(Page(JobPosting)),

	get: base
		.errors({ NOT_FOUND: {} })
		.meta(
			openapi({
				method: "GET",
				path: "/jobs/{id}",
				tags: ["jobs"],
				summary: "A job posting",
			}),
		)
		.input(JobId)
		.output(JobPosting),

	/** « Emplois qui correspondent à vos Tags »: live postings on the Tags the Member follows. */
	matching: base
		.errors({ UNAUTHORIZED: {} })
		.input(z.object({ limit: z.number().int().min(1).max(10).default(3) }))
		.output(z.object({ items: z.array(JobPosting) })),

	publish: base
		.errors({ ...humans, CONFLICT: {} })
		.meta(
			openapi({
				method: "POST",
				path: "/jobs",
				tags: ["jobs"],
				summary: "Publish a job posting",
				description:
					"The owner of a validated Organization publishes a posting for 30 days, with a link or an email to apply (exactly one). A posting that asks the candidate for money is refused. At most 5 live postings per Organization. Humans only.",
			}),
		)
		.input(PublishJobInput)
		.output(JobPosting),

	/** Closes one of the Organization's own postings early. */
	close: base
		.errors({ ...humans, NOT_FOUND: {} })
		.input(JobId)
		.output(z.object({ success: z.boolean() })),

	/** « Postuler avec ma fiche CodeSphere »: tells the Organization, and shares the card for this posting only. */
	applyTo: base
		.errors({ ...humans, NOT_FOUND: {}, CONFLICT: {} })
		.input(JobId.extend({ shareCard: z.boolean() }))
		.output(JobPosting),

	report: base
		.errors({ ...humans, NOT_FOUND: {} })
		.input(JobId.extend({ reason: z.string().trim().min(3).max(300) }))
		.output(z.object({ success: z.boolean() })),

	/** The postings of the Organizations the Member owns, live or not. */
	mine: base
		.errors({ UNAUTHORIZED: {} })
		.input(z.object({}))
		.output(
			z.object({
				items: z.array(
					JobPosting.extend({
						status: z.enum(["published", "removed"]),
						expired: z.boolean(),
						applicants: z.number().int(),
					}),
				),
			}),
		),

	/** Those who applied through CodeSphere, with their card when they shared it. Owner only. */
	applicants: base
		.errors({ ...humans, NOT_FOUND: {} })
		.input(JobId)
		.output(z.object({ items: z.array(JobApplicant) })),
};

export const talentContract = {
	mine: base
		.errors({ UNAUTHORIZED: {} })
		.meta(
			openapi({
				method: "GET",
				path: "/me/talent-card",
				tags: ["talent"],
				summary: "My Talent card",
				description:
					"The Member's optional profile for recruiters: off by default. Shows what a recruiter would see.",
			}),
		)
		.input(z.object({}))
		.output(OwnTalentCard),
	update: base
		.errors(humans)
		.input(UpdateTalentCardInput)
		.output(OwnTalentCard),
	/** Cards of the Members open to contact: for owners of a validated Organization only. */
	directory: base.errors(humans).input(PageInput).output(Page(TalentCardView)),
};

const adminErrors = { UNAUTHORIZED: {}, FORBIDDEN: {}, NOT_FOUND: {} } as const;

export const ReportedJob = JobPosting.extend({
	status: z.enum(["published", "removed"]),
	reports: z.number().int(),
	reasons: z.array(z.string()),
});

export const jobsAdminContract = {
	/** Postings with reports waiting for a decision. */
	review: base
		.errors({ UNAUTHORIZED: {}, FORBIDDEN: {} })
		.input(PageInput)
		.output(Page(ReportedJob)),
	/** The report is founded: the posting is removed, and two founded reports suspend its Organization. */
	uphold: base
		.errors(adminErrors)
		.input(JobId.extend({ reason: z.string().trim().min(3).max(300) }))
		.output(z.object({ organizationSuspended: z.boolean() })),
	dismiss: base
		.errors(adminErrors)
		.input(JobId)
		.output(z.object({ success: z.boolean() })),
};

export type JobPosting = z.infer<typeof JobPosting>;
export type TalentCardView = z.infer<typeof TalentCardView>;
export type OwnTalentCard = z.infer<typeof OwnTalentCard>;
