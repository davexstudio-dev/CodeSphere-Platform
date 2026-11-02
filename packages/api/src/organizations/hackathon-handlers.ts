import { ORGANIZATION_TERMS_VERSION } from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import { hackathon } from "@codesphere/db/schema/hackathons";
import {
	organization,
	organizationMember,
} from "@codesphere/db/schema/organizations";
import { hackathonTeams } from "@codesphere/db/schema/teams";
import { and, eq, or, sql } from "drizzle-orm";

import {
	advanceHackathon,
	createHackathon,
	type HackathonWriteOutcome,
	listAdminHackathons,
	unpublishedReasons,
	updateHackathon,
} from "../admin-hackathons";
import { ALL_STATUSES, loadHackathons } from "../hackathons";
import { impl } from "../index";
import { acceptTerms, termsOf } from "./terms";

type Sessioned = { session: { user: object } | null };

/**
 * The Organization the caller may run Hackathons for (#326): validated, created by a Member (the
 * CADEV's stays with the Admins) and the caller its owner or an editor. Anything else is simply
 * not found, so a stranger learns nothing about it.
 */
async function editableOrganization(
	db: Database,
	memberId: string,
	where: { id: string } | { slug: string },
) {
	const [row] = await db
		.select({
			id: organization.id,
			slug: organization.slug,
			ownerId: organization.ownerId,
		})
		.from(organization)
		.where(
			and(
				"id" in where
					? eq(organization.id, where.id)
					: eq(organization.slug, where.slug),
				eq(organization.status, "validated"),
				eq(organization.system, false),
				or(
					eq(organization.ownerId, memberId),
					sql`EXISTS (SELECT 1 FROM ${organizationMember}
						WHERE ${organizationMember.organizationId} = ${organization.id}
						AND ${organizationMember.userId} = ${memberId})`,
				),
			),
		);
	return row;
}

type Errors = {
	UNAUTHORIZED: () => Error;
	FORBIDDEN: () => Error;
	NOT_FOUND: () => Error;
	BAD_REQUEST: (options: {
		data: { issues: { path: string[]; message: string }[] };
	}) => Error;
	CONFLICT: (options: { data: { version: number } }) => Error;
};

function humanOf(context: Sessioned, errors: Errors) {
	const user = context.session?.user as
		| { id: string; kind?: string }
		| undefined;
	if (!user) {
		throw errors.UNAUTHORIZED();
	}
	if (user.kind === "agent") {
		throw errors.FORBIDDEN();
	}
	return user.id;
}

function outcomeOr(errors: Errors, outcome: HackathonWriteOutcome) {
	if (outcome.ok) {
		return outcome.hackathon;
	}
	if (outcome.code === "BAD_REQUEST") {
		throw errors.BAD_REQUEST({
			data: { issues: [{ path: [outcome.path], message: outcome.message }] },
		});
	}
	if (outcome.code === "NOT_FOUND") {
		throw errors.NOT_FOUND();
	}
	throw errors.CONFLICT({ data: { version: outcome.version } });
}

/** The Organization behind an existing Hackathon, when the caller may run it. */
async function ownHackathon(
	db: Database,
	memberId: string,
	slug: string,
	errors: Errors,
) {
	const [current] = await loadHackathons(
		db,
		{ slug, statuses: ALL_STATUSES },
		1,
	);
	const org =
		current?.organizationSlug &&
		(await editableOrganization(db, memberId, {
			slug: current.organizationSlug,
		}));
	if (!current || !org) {
		throw errors.NOT_FOUND();
	}
	return { current, org };
}

export function createOrganizationHackathonHandlers() {
	return {
		list: impl.organizations.hackathons.list.handler(
			async ({ context, input, errors }) => {
				const memberId = humanOf(context, errors);
				const org = await editableOrganization(context.db, memberId, {
					id: input.organizationId,
				});
				if (!org) {
					throw errors.NOT_FOUND();
				}
				return { items: await listAdminHackathons(context.db, org.id) };
			},
		),
		terms: {
			get: impl.organizations.hackathons.terms.get.handler(
				async ({ context, input, errors }) => {
					const memberId = humanOf(context, errors);
					if (
						!(await editableOrganization(context.db, memberId, {
							id: input.organizationId,
						}))
					) {
						throw errors.NOT_FOUND();
					}
					return termsOf(context.db, input.organizationId);
				},
			),
			accept: impl.organizations.hackathons.terms.accept.handler(
				async ({ context, input, errors }) => {
					const memberId = humanOf(context, errors);
					const org = await editableOrganization(context.db, memberId, {
						id: input.organizationId,
					});
					if (!org) {
						throw errors.NOT_FOUND();
					}
					// The owner answers for the Organization: an editor cannot accept in its name.
					if (org.ownerId !== memberId) {
						throw errors.FORBIDDEN();
					}
					if (input.version !== ORGANIZATION_TERMS_VERSION) {
						throw errors.CONFLICT({ data: { version: 0 } });
					}
					return acceptTerms(context.db, memberId, org.id);
				},
			),
		},
		create: impl.organizations.hackathons.create.handler(
			async ({ context, input, errors }) => {
				const memberId = humanOf(context, errors);
				if (
					!(await editableOrganization(context.db, memberId, {
						slug: input.organizationSlug,
					}))
				) {
					throw errors.NOT_FOUND();
				}
				return outcomeOr(
					errors,
					await createHackathon(context.db, memberId, input),
				);
			},
		),
		advance: impl.organizations.hackathons.advance.handler(
			async ({ context, input, errors }) => {
				const memberId = humanOf(context, errors);
				const { current, org } = await ownHackathon(
					context.db,
					memberId,
					input.slug,
					errors,
				);
				// An Admin's unpublication holds until an Admin lifts it.
				if (
					current.status === "draft" &&
					(await unpublishedReasons(context.db, org.id)).has(current.slug)
				) {
					throw errors.FORBIDDEN({
						message:
							"An Admin unpublished this Hackathon and has not cleared it.",
					});
				}
				// Publishing is free of review, but not of the terms: the Organization answers for it.
				if (
					current.status === "draft" &&
					!(await termsOf(context.db, org.id)).accepted
				) {
					throw errors.FORBIDDEN({
						message: "The Organization has not accepted the terms.",
					});
				}
				return outcomeOr(
					errors,
					await advanceHackathon(context.db, memberId, input),
				);
			},
		),
		update: impl.organizations.hackathons.update.handler(
			async ({ context, input, errors }) => {
				const memberId = humanOf(context, errors);
				const { current } = await ownHackathon(
					context.db,
					memberId,
					input.slug,
					errors,
				);
				// Handing a Hackathon to another Organization is for an Admin.
				if (
					input.organizationSlug !== undefined &&
					input.organizationSlug !== current.organizationSlug
				) {
					throw errors.BAD_REQUEST({
						data: {
							issues: [
								{
									path: ["organizationSlug"],
									message: "Only an Admin can change the organizer.",
								},
							],
						},
					});
				}
				// An archived Hackathon is closed for good: only an Admin can still touch it (#338).
				if (current.status === "archived") {
					throw errors.FORBIDDEN({
						message: "An archived Hackathon can only be edited by an Admin.",
					});
				}
				// Teams already formed must still fit: the Organization cannot pull the rug (#338).
				if (input.teamsEnabled === false || input.teamMax !== undefined) {
					const [teams] = await context.db
						.select({
							count: sql<number>`count(*)::int`,
							largest: sql<number>`coalesce(max(${hackathonTeams.memberCount}), 0)::int`,
						})
						.from(hackathonTeams)
						.innerJoin(hackathon, eq(hackathon.id, hackathonTeams.hackathonId))
						.where(eq(hackathon.slug, input.slug));
					if (teams && teams.count > 0) {
						if (input.teamsEnabled === false && current.teamsEnabled) {
							throw errors.BAD_REQUEST({
								data: {
									issues: [
										{
											path: ["teamsEnabled"],
											message:
												"Teams already exist: they cannot be turned off.",
										},
									],
								},
							});
						}
						if (input.teamMax !== undefined && input.teamMax < teams.largest) {
							throw errors.BAD_REQUEST({
								data: {
									issues: [
										{
											path: ["teamMax"],
											message: `A team already has ${teams.largest} members: teamMax cannot be lower.`,
										},
									],
								},
							});
						}
					}
				}
				// The Organization vouches for what it edits: the check date moves to now.
				return outcomeOr(
					errors,
					await updateHackathon(context.db, memberId, {
						...input,
						verifiedAt: new Date().toISOString(),
					}),
				);
			},
		),
	};
}
