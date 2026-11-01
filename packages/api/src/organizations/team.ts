import type {
	OrganizationInvitation,
	OrganizationRole,
	OrganizationTeam,
} from "@codesphere/contract";
import { MAX_ORGANIZATION_EDITORS } from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import {
	organization,
	organizationInvitation,
	organizationMember,
} from "@codesphere/db/schema/organizations";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { withAudit } from "../audit";

/**
 * The team of an Organization (#326). The owner (`organization.owner_id`) manages the members and
 * the profile; every `organization_member` row is an editor who runs the Hackathons. Every write is
 * one audited statement (the Worker's database has no transactions); the checks that decide what a
 * caller may do are reads before it, the ones that must not race are in the statement's WHERE.
 */
export class TeamError extends Error {
	constructor(
		readonly code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT",
		readonly path?: string,
	) {
		super(code);
	}
}

export const TEAM_MESSAGES: Record<string, string> = {
	member: "No active Member has this id.",
	self: "You already manage this Organization.",
	already: "This Member is already on the team.",
	pending: "This Member already has an open invitation.",
	full: "The team is full.",
	status: "Only a validated Organization has a team.",
	editor: "Only an editor can take over the management.",
	owner: "The owner cannot be removed: hand the management over first.",
	gone: "This invitation is no longer open.",
	owned: "This Organization already has an owner.",
};

const inviter = alias(user, "inviter");
const invitee = alias(user, "invitee");

type InvitationRow = {
	id: string;
	organizationId: string;
	organizationName: string;
	inviteeId: string;
	inviteeName: string;
	invitedByName: string | null;
	role: "editor" | "owner";
	createdAt: Date;
};

const invitationOf = (row: InvitationRow): OrganizationInvitation => ({
	...row,
	createdAt: row.createdAt.toISOString(),
});

const invitationSelect = {
	id: organizationInvitation.id,
	organizationId: organizationInvitation.organizationId,
	organizationName: organization.name,
	inviteeId: organizationInvitation.inviteeId,
	inviteeName: invitee.name,
	invitedByName: inviter.name,
	role: organizationInvitation.role,
	createdAt: organizationInvitation.createdAt,
};

export function createTeamService(db: Database) {
	async function orgById(id: string) {
		const [row] = await db
			.select({
				id: organization.id,
				ownerId: organization.ownerId,
				status: organization.status,
				system: organization.system,
				createdAt: organization.createdAt,
			})
			.from(organization)
			.where(eq(organization.id, id));
		return row;
	}

	async function roleOf(
		organizationId: string,
		memberId: string,
	): Promise<OrganizationRole | null> {
		const org = await orgById(organizationId);
		if (!org) {
			return null;
		}
		if (org.ownerId === memberId) {
			return "owner";
		}
		const [row] = await db
			.select({ userId: organizationMember.userId })
			.from(organizationMember)
			.where(
				and(
					eq(organizationMember.organizationId, organizationId),
					eq(organizationMember.userId, memberId),
				),
			);
		return row ? "editor" : null;
	}

	/** The org when the caller owns it: NOT_FOUND hides it from a stranger, FORBIDDEN for an editor. */
	async function ownedBy(organizationId: string, actorId: string) {
		const org = await orgById(organizationId);
		const role = org ? await roleOf(organizationId, actorId) : null;
		if (!org || !role) {
			throw new TeamError("NOT_FOUND");
		}
		if (role !== "owner") {
			throw new TeamError("FORBIDDEN");
		}
		return org;
	}

	async function invitationView(id: string) {
		const [row] = await db
			.select(invitationSelect)
			.from(organizationInvitation)
			.innerJoin(
				organization,
				eq(organization.id, organizationInvitation.organizationId),
			)
			.innerJoin(invitee, eq(invitee.id, organizationInvitation.inviteeId))
			.leftJoin(inviter, eq(inviter.id, organizationInvitation.invitedBy))
			.where(eq(organizationInvitation.id, id));
		if (!row) {
			throw new TeamError("NOT_FOUND");
		}
		return invitationOf(row);
	}

	async function createInvitation(
		actorId: string,
		organizationId: string,
		memberId: string,
		role: "editor" | "owner",
	) {
		const rows = await withAudit(
			db,
			{
				actorId,
				action:
					role === "owner" ? "organization.transfer" : "organization.invite",
				targetType: "organization",
				targetIdColumn: "organization_id",
				details: { fields: ["member"] },
			},
			db
				.insert(organizationInvitation)
				.values({
					organizationId,
					inviteeId: memberId,
					invitedBy: actorId,
					role,
				})
				.onConflictDoNothing()
				.returning({
					id: organizationInvitation.id,
					organization_id: organizationInvitation.organizationId,
				}),
		);
		const id = rows[0]?.id as string | undefined;
		if (!id) {
			throw new TeamError("CONFLICT", "pending");
		}
		return invitationView(id);
	}

	return {
		roleOf,

		async get(
			actorId: string,
			organizationId: string,
		): Promise<OrganizationTeam> {
			const myRole = await roleOf(organizationId, actorId);
			if (!myRole) {
				throw new TeamError("NOT_FOUND");
			}
			const org = await orgById(organizationId);
			const owner = org?.ownerId
				? (
						await db
							.select({ name: user.name })
							.from(user)
							.where(eq(user.id, org.ownerId))
					)[0]
				: undefined;
			const editors = await db
				.select({
					memberId: organizationMember.userId,
					name: user.name,
					since: organizationMember.createdAt,
				})
				.from(organizationMember)
				.innerJoin(user, eq(user.id, organizationMember.userId))
				.where(eq(organizationMember.organizationId, organizationId))
				.orderBy(
					asc(organizationMember.createdAt),
					asc(organizationMember.userId),
				);
			const invitations = await db
				.select(invitationSelect)
				.from(organizationInvitation)
				.innerJoin(
					organization,
					eq(organization.id, organizationInvitation.organizationId),
				)
				.innerJoin(invitee, eq(invitee.id, organizationInvitation.inviteeId))
				.leftJoin(inviter, eq(inviter.id, organizationInvitation.invitedBy))
				.where(
					and(
						eq(organizationInvitation.organizationId, organizationId),
						eq(organizationInvitation.status, "pending"),
					),
				)
				.orderBy(desc(organizationInvitation.createdAt));
			return {
				organizationId,
				myRole,
				members: [
					...(org?.ownerId && owner
						? [
								{
									memberId: org.ownerId,
									name: owner.name,
									role: "owner" as const,
									since: org.createdAt.toISOString(),
								},
							]
						: []),
					...editors.map((e) => ({
						memberId: e.memberId,
						name: e.name,
						role: "editor" as const,
						since: e.since.toISOString(),
					})),
				],
				invitations: invitations.map(invitationOf),
			};
		},

		async invite(actorId: string, organizationId: string, memberId: string) {
			const org = await ownedBy(organizationId, actorId);
			if (org.status !== "validated" || org.system) {
				throw new TeamError("CONFLICT", "status");
			}
			if (memberId === actorId) {
				throw new TeamError("CONFLICT", "self");
			}
			const [target] = await db
				.select({ id: user.id })
				.from(user)
				.where(
					and(
						eq(user.id, memberId),
						eq(user.kind, "human"),
						sql`${user.suspendedAt} IS NULL`,
					),
				);
			if (!target) {
				throw new TeamError("NOT_FOUND", "member");
			}
			if (await roleOf(organizationId, memberId)) {
				throw new TeamError("CONFLICT", "already");
			}
			const [{ editors } = { editors: 0 }] = await db
				.select({ editors: sql<number>`count(*)::int` })
				.from(organizationMember)
				.where(eq(organizationMember.organizationId, organizationId));
			if (Number(editors) >= MAX_ORGANIZATION_EDITORS) {
				throw new TeamError("CONFLICT", "full");
			}
			return createInvitation(actorId, organizationId, memberId, "editor");
		},

		async transfer(actorId: string, organizationId: string, memberId: string) {
			const org = await ownedBy(organizationId, actorId);
			if (org.status !== "validated" || org.system) {
				throw new TeamError("CONFLICT", "status");
			}
			if ((await roleOf(organizationId, memberId)) !== "editor") {
				throw new TeamError("CONFLICT", "editor");
			}
			return createInvitation(actorId, organizationId, memberId, "owner");
		},

		async cancel(actorId: string, invitationId: string) {
			const rows = await withAudit(
				db,
				{
					actorId,
					action: "organization.invitation_cancel",
					targetType: "organization",
					targetIdColumn: "organization_id",
				},
				db
					.update(organizationInvitation)
					.set({ status: "cancelled", decidedAt: new Date() })
					.where(
						and(
							eq(organizationInvitation.id, invitationId),
							eq(organizationInvitation.status, "pending"),
							sql`${organizationInvitation.organizationId} IN (
								SELECT id FROM organization WHERE owner_id = ${actorId})`,
						),
					)
					.returning({
						organization_id: organizationInvitation.organizationId,
					}),
			);
			if (rows.length === 0) {
				throw new TeamError("NOT_FOUND");
			}
		},

		/** The owner removes an editor, an editor leaves, or (`staff`) an Admin steps in. */
		async remove(
			actorId: string,
			organizationId: string,
			memberId: string,
			staff = false,
		) {
			const org = await orgById(organizationId);
			if (!org) {
				throw new TeamError("NOT_FOUND");
			}
			if (memberId === org.ownerId) {
				throw new TeamError("CONFLICT", "owner");
			}
			if (!staff) {
				if (actorId === memberId) {
					if (!(await roleOf(organizationId, actorId))) {
						throw new TeamError("NOT_FOUND");
					}
				} else {
					await ownedBy(organizationId, actorId);
				}
			}
			const rows = await withAudit(
				db,
				{
					actorId,
					action: "organization.member_remove",
					targetType: "organization",
					targetIdColumn: "organization_id",
					details: { fields: ["member"] },
				},
				db
					.delete(organizationMember)
					.where(
						and(
							eq(organizationMember.organizationId, organizationId),
							eq(organizationMember.userId, memberId),
						),
					)
					.returning({
						organization_id: organizationMember.organizationId,
					}),
			);
			if (rows.length === 0) {
				throw new TeamError("NOT_FOUND");
			}
		},

		/**
		 * An Admin names the owner of a validated, non-system Organization that has none. One statement:
		 * the owner is set only while the seat is empty, and the Member stops being an editor.
		 */
		async assignOwner(
			actorId: string,
			organizationId: string,
			memberId: string,
		) {
			const org = await orgById(organizationId);
			if (!org) {
				throw new TeamError("NOT_FOUND");
			}
			if (org.ownerId || org.system || org.status !== "validated") {
				throw new TeamError("CONFLICT", "owned");
			}
			const [target] = await db
				.select({ id: user.id })
				.from(user)
				.where(
					and(
						eq(user.id, memberId),
						eq(user.kind, "human"),
						sql`${user.suspendedAt} IS NULL`,
					),
				);
			if (!target) {
				throw new TeamError("NOT_FOUND", "member");
			}
			const rows = await withAudit(
				db,
				{
					actorId,
					action: "organization.owner_assign",
					targetType: "organization",
					targetIdColumn: "id",
					details: { fields: ["owner"] },
				},
				db
					.update(organization)
					.set({ ownerId: memberId, version: sql`${organization.version} + 1` })
					.where(
						and(
							eq(organization.id, organizationId),
							sql`${organization.ownerId} IS NULL`,
							eq(organization.status, "validated"),
							eq(organization.system, false),
						),
					)
					.returning({ id: organization.id }),
				[
					sql`DELETE FROM organization_member
						WHERE organization_id IN (SELECT id FROM m) AND user_id = ${memberId}`,
				],
			);
			if (rows.length === 0) {
				throw new TeamError("CONFLICT", "owned");
			}
		},

		async mineInvitations(memberId: string) {
			const rows = await db
				.select(invitationSelect)
				.from(organizationInvitation)
				.innerJoin(
					organization,
					eq(organization.id, organizationInvitation.organizationId),
				)
				.innerJoin(invitee, eq(invitee.id, organizationInvitation.inviteeId))
				.leftJoin(inviter, eq(inviter.id, organizationInvitation.invitedBy))
				.where(
					and(
						eq(organizationInvitation.inviteeId, memberId),
						eq(organizationInvitation.status, "pending"),
						eq(organization.status, "validated"),
					),
				)
				.orderBy(desc(organizationInvitation.createdAt));
			return rows.map(invitationOf);
		},

		async decline(memberId: string, invitationId: string) {
			const rows = await withAudit(
				db,
				{
					actorId: memberId,
					action: "organization.invitation_decline",
					targetType: "organization",
					targetIdColumn: "organization_id",
				},
				db
					.update(organizationInvitation)
					.set({ status: "declined", decidedAt: new Date() })
					.where(
						and(
							eq(organizationInvitation.id, invitationId),
							eq(organizationInvitation.inviteeId, memberId),
							eq(organizationInvitation.status, "pending"),
						),
					)
					.returning({
						organization_id: organizationInvitation.organizationId,
					}),
			);
			if (rows.length === 0) {
				throw new TeamError("NOT_FOUND");
			}
		},

		/**
		 * One statement. An `editor` invitation adds the Member to the team. An `owner` one swaps the
		 * two: the invitee becomes the owner and the former owner an editor, but only while the sender
		 * still owns the Organization and the invitee is still an editor, so a stale offer does
		 * nothing.
		 */
		async accept(memberId: string, invitationId: string) {
			const inv = organizationInvitation;
			const rows = await withAudit(
				db,
				{
					actorId: memberId,
					action: "organization.invitation_accept",
					targetType: "organization",
					targetIdColumn: "organization_id",
				},
				db
					.update(inv)
					.set({ status: "accepted", decidedAt: new Date() })
					.where(
						and(
							eq(inv.id, invitationId),
							eq(inv.inviteeId, memberId),
							eq(inv.status, "pending"),
							sql`EXISTS (
								SELECT 1 FROM organization o
								WHERE o.id = ${inv.organizationId} AND o.status = 'validated'
								AND CASE WHEN ${inv.role} = 'owner'
									THEN o.owner_id = ${inv.invitedBy} AND EXISTS (
										SELECT 1 FROM organization_member om
										WHERE om.organization_id = o.id AND om.user_id = ${inv.inviteeId})
									ELSE o.owner_id IS DISTINCT FROM ${inv.inviteeId} END
							)`,
						),
					)
					.returning({
						organization_id: inv.organizationId,
						invitee_id: inv.inviteeId,
						invited_by: inv.invitedBy,
						role: inv.role,
					}),
				[
					sql`INSERT INTO organization_member (organization_id, user_id)
						SELECT organization_id, invitee_id FROM m WHERE role = 'editor'
						ON CONFLICT DO NOTHING`,
					sql`DELETE FROM organization_member
						WHERE (organization_id, user_id) IN (
							SELECT organization_id, invitee_id FROM m WHERE role = 'owner')`,
					sql`INSERT INTO organization_member (organization_id, user_id)
						SELECT organization_id, invited_by FROM m WHERE role = 'owner'
						ON CONFLICT DO NOTHING`,
					sql`UPDATE organization SET owner_id = (SELECT invitee_id FROM m WHERE role = 'owner'),
						version = version + 1
						WHERE id IN (SELECT organization_id FROM m WHERE role = 'owner')`,
				],
			);
			if (rows.length === 0) {
				throw new TeamError("CONFLICT", "gone");
			}
		},
	};
}
