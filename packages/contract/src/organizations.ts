import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { base, Page, PageInput, Region } from "./base";

export const ORGANIZATION_STATUSES = [
	"pending",
	"validated",
	"rejected",
	"suspended",
] as const;
export const OrganizationStatus = z.enum(ORGANIZATION_STATUSES);
export type OrganizationStatus = z.infer<typeof OrganizationStatus>;

/** The public profile of a validated Organization: never its contact email or review notes. */
export const OrganizationProfile = z.object({
	slug: z.string(),
	name: z.string(),
	website: z.url(),
	description: z.string(),
	country: z.string(),
	validatedAt: z.iso.datetime().nullable(),
});

/** An Organization as its owner sees it: with its status and, once decided, the reason. */
export const OwnOrganization = OrganizationProfile.extend({
	id: z.string(),
	status: OrganizationStatus,
	statusReason: z.string().nullable(),
	contactEmail: z.string().nullable(),
	createdAt: z.iso.datetime(),
});

export const OrganizationApplication = z.object({
	name: z.string().trim().min(2).max(120),
	website: z.url().max(2048),
	/** An address on the Organization's own domain (a free mailbox is refused). */
	contactEmail: z.email().max(254),
	country: Region.shape.country,
	description: z.string().trim().max(1000).default(""),
});

export const ORGANIZATIONS_PER_MEMBER = 3;

export const organizationsContract = {
	get: base
		.errors({ NOT_FOUND: {} })
		.meta(
			openapi({
				method: "GET",
				path: "/organizations/{slug}",
				tags: ["organizations"],
				summary: "Organization profile",
				description:
					"The public profile of a validated Organization. A pending, rejected or suspended one is NOT_FOUND. Public.",
			}),
		)
		.input(z.object({ slug: z.string().trim().min(1).max(120) }))
		.output(OrganizationProfile),

	list: base
		.meta(
			openapi({
				method: "GET",
				path: "/organizations",
				tags: ["organizations"],
				summary: "List validated Organizations",
				description: "Validated Organizations by name. Public.",
			}),
		)
		.input(PageInput)
		.output(Page(OrganizationProfile)),

	// Not named `apply`: a procedure shadowing Function.prototype.apply breaks the client proxies.
	request: base
		.errors({
			UNAUTHORIZED: {},
			FORBIDDEN: {},
			CONFLICT: {},
		})
		.meta(
			openapi({
				method: "POST",
				path: "/organizations",
				tags: ["organizations"],
				summary: "Apply for an Organization",
				description: `A Member applies on behalf of an Organization: name, website, an email on its own domain and its country. An Admin validates it. At most ${ORGANIZATIONS_PER_MEMBER} open applications per Member. Humans only.`,
			}),
		)
		.input(OrganizationApplication)
		.output(OwnOrganization),

	mine: base
		.errors({ UNAUTHORIZED: {} })
		.meta(
			openapi({
				method: "GET",
				path: "/me/organizations",
				tags: ["organizations"],
				summary: "My applications",
				description:
					"The Organizations the Member applied for, with their status.",
			}),
		)
		.input(z.object({}))
		.output(z.object({ items: z.array(OwnOrganization) })),
};

// Admin side (#257): applications, validation, suspension.
export const AdminOrganization = OwnOrganization.extend({
	ownerName: z.string().nullable(),
	version: z.number().int().min(1),
	system: z.boolean(),
});

const decisionErrors = {
	UNAUTHORIZED: {},
	FORBIDDEN: {},
	NOT_FOUND: {},
	CONFLICT: {},
} as const;
const Decision = z.object({
	id: z.uuid(),
	expectedVersion: z.number().int().min(1),
});
const Reason = z.string().trim().min(3).max(300);

export const organizationsAdminContract = {
	list: base
		.errors({ UNAUTHORIZED: {}, FORBIDDEN: {} })
		.input(PageInput.extend({ status: OrganizationStatus.optional() }))
		.output(Page(AdminOrganization)),
	/** Pending to validated: the Organization may now list Hackathons. */
	validate: base
		.errors(decisionErrors)
		.input(Decision)
		.output(AdminOrganization),
	/** Pending to rejected, with the reason shown to the applicant. */
	reject: base
		.errors(decisionErrors)
		.input(Decision.extend({ reason: Reason }))
		.output(AdminOrganization),
	/** Validated to suspended, with a reason. Its Hackathons stay listed; it can publish nothing new. */
	suspend: base
		.errors(decisionErrors)
		.input(Decision.extend({ reason: Reason }))
		.output(AdminOrganization),
	/** Suspended to validated again. */
	reinstate: base
		.errors(decisionErrors)
		.input(Decision)
		.output(AdminOrganization),
};

export type OwnOrganization = z.infer<typeof OwnOrganization>;
export type OrganizationProfile = z.infer<typeof OrganizationProfile>;
export type AdminOrganization = z.infer<typeof AdminOrganization>;
