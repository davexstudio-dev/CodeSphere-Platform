import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { base, HttpUrl, Page, PageInput, Region } from "./base";

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
	website: HttpUrl.max(2048),
	/** An address on the Organization's own domain (a free mailbox is refused). */
	contactEmail: z.email().max(254),
	country: Region.shape.country,
	description: z.string().trim().max(1000).default(""),
});

export const ORGANIZATIONS_PER_MEMBER = 3;

// The team of an Organization (#326): its owner manages members and the profile, an editor runs
// its Hackathons. Two roles only.
export const ORGANIZATION_ROLES = ["owner", "editor"] as const;
export const OrganizationRole = z.enum(ORGANIZATION_ROLES);
export type OrganizationRole = z.infer<typeof OrganizationRole>;
export const MAX_ORGANIZATION_EDITORS = 20;

/** An Organization as a member of its team sees it. */
export const MyOrganization = OwnOrganization.extend({
	myRole: OrganizationRole,
});

export const OrganizationTeamMember = z.object({
	memberId: z.string(),
	name: z.string(),
	role: OrganizationRole,
	since: z.iso.datetime().nullable(),
});

/** An invitation to join a team (`editor`) or to take over its management (`owner`). */
export const OrganizationInvitation = z.object({
	id: z.uuid(),
	organizationId: z.uuid(),
	organizationName: z.string(),
	inviteeId: z.string(),
	inviteeName: z.string(),
	invitedByName: z.string().nullable(),
	role: z.enum(["editor", "owner"]),
	createdAt: z.iso.datetime(),
});

export const OrganizationTeam = z.object({
	organizationId: z.uuid(),
	myRole: OrganizationRole,
	/** The owner first, then the editors by seniority. Empty owner slot: the Organization has none. */
	members: z.array(OrganizationTeamMember),
	invitations: z.array(OrganizationInvitation),
});

const teamErrors = {
	UNAUTHORIZED: {},
	FORBIDDEN: {},
	NOT_FOUND: {},
	CONFLICT: {},
} as const;
const OrgId = z.object({ organizationId: z.uuid() });
const OrgMember = OrgId.extend({ memberId: z.string().min(1).max(128) });

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
		.output(z.object({ items: z.array(MyOrganization) })),

	/** Who works on an Organization (#326). Humans only; none of it is public. */
	team: {
		get: base.errors(teamErrors).input(OrgId).output(OrganizationTeam),
		/** The owner invites a Member (by id, as in their profile address); the invitee must accept. */
		invite: base
			.errors(teamErrors)
			.input(OrgMember)
			.output(OrganizationInvitation),
		/** The owner withdraws an invitation that was not answered yet. */
		cancel: base
			.errors(teamErrors)
			.input(z.object({ invitationId: z.uuid() }))
			.output(z.object({ cancelled: z.literal(true) })),
		/** The owner removes an editor; an editor can remove themselves. */
		remove: base
			.errors(teamErrors)
			.input(OrgMember)
			.output(z.object({ removed: z.literal(true) })),
		/** The owner hands the management to an editor, who must accept. */
		transfer: base
			.errors(teamErrors)
			.input(OrgMember)
			.output(OrganizationInvitation),
	},

	invitations: {
		mine: base
			.errors({ UNAUTHORIZED: {} })
			.input(z.object({}))
			.output(z.object({ items: z.array(OrganizationInvitation) })),
		accept: base
			.errors(teamErrors)
			.input(z.object({ invitationId: z.uuid() }))
			.output(z.object({ accepted: z.literal(true) })),
		decline: base
			.errors(teamErrors)
			.input(z.object({ invitationId: z.uuid() }))
			.output(z.object({ declined: z.literal(true) })),
	},
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
	/**
	 * An Admin names the owner of a validated Organization that has none, after its owner deleted
	 * their account with no editor to take over (#326). The Member becomes the owner, whether or not
	 * they were an editor. CONFLICT when the Organization already has an owner. Audited.
	 */
	assignOwner: base
		.errors(decisionErrors)
		.input(z.object({ organizationId: z.uuid(), memberId: z.string().min(1) }))
		.output(z.object({ assigned: z.literal(true) })),
	/** An Admin removes an editor from a team, e.g. in a dispute (#326). Audited. */
	removeMember: base
		.errors(decisionErrors)
		.input(z.object({ organizationId: z.uuid(), memberId: z.string().min(1) }))
		.output(z.object({ removed: z.literal(true) })),
};

export type OwnOrganization = z.infer<typeof OwnOrganization>;
export type OrganizationProfile = z.infer<typeof OrganizationProfile>;
export type OrganizationTeam = z.infer<typeof OrganizationTeam>;
export type OrganizationInvitation = z.infer<typeof OrganizationInvitation>;
export type MyOrganization = z.infer<typeof MyOrganization>;
export type AdminOrganization = z.infer<typeof AdminOrganization>;
