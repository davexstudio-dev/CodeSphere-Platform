import type { Database } from "@codesphere/db";
import {
	organization,
	organizationMember,
} from "@codesphere/db/schema/organizations";
import { and, eq, or, sql } from "drizzle-orm";

import {
	advanceHackathon,
	createHackathon,
	type HackathonWriteOutcome,
	listAdminHackathons,
	updateHackathon,
} from "../admin-hackathons";
import { ALL_STATUSES, loadHackathons } from "../hackathons";
import { impl } from "../index";

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
		.select({ id: organization.id, slug: organization.slug })
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
				await ownHackathon(context.db, memberId, input.slug, errors);
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
				return outcomeOr(
					errors,
					await updateHackathon(context.db, memberId, input),
				);
			},
		),
	};
}
