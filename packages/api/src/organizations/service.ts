import type {
	AdminOrganization,
	OrganizationStatus,
	OwnOrganization,
} from "@codesphere/contract";
import { ORGANIZATIONS_PER_MEMBER } from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import { organization } from "@codesphere/db/schema/organizations";
import { slugify } from "@codesphere/db/slug";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { withAudit } from "../audit";
import { emailMatchesWebsite } from "./rules";

export class OrganizationError extends Error {
	constructor(
		readonly code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST",
		readonly path?: string,
	) {
		super(code);
	}
}

export class InvalidOrganizationCursorError extends Error {}

type Row = typeof organization.$inferSelect;

const iso = (date: Date | null) => (date ? date.toISOString() : null);

const profileOf = (row: Row) => ({
	slug: row.slug,
	name: row.name,
	website: row.website,
	description: row.description,
	country: row.country,
	validatedAt: row.status === "validated" ? iso(row.reviewedAt) : null,
});

const ownOf = (row: Row): OwnOrganization => ({
	...profileOf(row),
	id: row.id,
	status: row.status,
	statusReason: row.statusReason,
	contactEmail: row.contactEmail,
	createdAt: row.createdAt.toISOString(),
});

function offsetOf(cursor: string | undefined) {
	if (cursor === undefined) {
		return 0;
	}
	const match = /^o(\d{1,5})$/.exec(cursor);
	if (!match) {
		throw new InvalidOrganizationCursorError();
	}
	return Number(match[1]);
}

/** A decision of an Admin and the status it applies to. */
const DECISIONS = {
	validate: {
		from: "pending",
		to: "validated",
		event: "organization.validate",
	},
	reject: { from: "pending", to: "rejected", event: "organization.reject" },
	suspend: {
		from: "validated",
		to: "suspended",
		event: "organization.suspend",
	},
	reinstate: {
		from: "suspended",
		to: "validated",
		event: "organization.reinstate",
	},
} as const satisfies Record<
	string,
	{ from: OrganizationStatus; to: OrganizationStatus; event: string }
>;
export type Decision = keyof typeof DECISIONS;

export function createOrganizationService(db: Database) {
	async function byId(id: string) {
		const [row] = await db
			.select()
			.from(organization)
			.where(eq(organization.id, id));
		return row;
	}

	async function adminView(id: string): Promise<AdminOrganization> {
		const [found] = await db
			.select({ row: organization, ownerName: user.name })
			.from(organization)
			.leftJoin(user, eq(user.id, organization.ownerId))
			.where(eq(organization.id, id));
		if (!found) {
			throw new OrganizationError("NOT_FOUND");
		}
		return {
			...ownOf(found.row),
			ownerName: found.ownerName,
			version: found.row.version,
			system: found.row.system,
		};
	}

	return {
		/** A Member applies on behalf of an Organization; an Admin then decides. */
		async apply(
			ownerId: string,
			input: {
				name: string;
				website: string;
				contactEmail: string;
				country: string;
				description: string;
			},
		): Promise<OwnOrganization> {
			if (!emailMatchesWebsite(input.contactEmail, input.website)) {
				throw new OrganizationError("BAD_REQUEST", "contactEmail");
			}
			const slug = slugify(input.name);
			if (!slug) {
				throw new OrganizationError("BAD_REQUEST", "name");
			}
			const [{ open } = { open: 0 }] = await db
				.select({ open: sql<number>`count(*)::int` })
				.from(organization)
				.where(
					and(
						eq(organization.ownerId, ownerId),
						inArray(organization.status, ["pending", "validated", "suspended"]),
					),
				);
			if (Number(open) >= ORGANIZATIONS_PER_MEMBER) {
				throw new OrganizationError("CONFLICT", "limit");
			}
			const rows = await withAudit(
				db,
				{
					actorId: ownerId,
					action: "organization.apply",
					targetType: "organization",
					targetIdColumn: "id",
				},
				db
					.insert(organization)
					.values({
						slug,
						name: input.name,
						website: input.website,
						description: input.description,
						country: input.country,
						contactEmail: input.contactEmail.toLowerCase(),
						ownerId,
					})
					.onConflictDoNothing({ target: organization.slug })
					.returning({ id: organization.id }),
			);
			const id = rows[0]?.id as string | undefined;
			const created = id ? await byId(id) : undefined;
			if (!created) {
				throw new OrganizationError("CONFLICT", "slug");
			}
			return ownOf(created);
		},

		async profile(slug: string) {
			const [row] = await db
				.select()
				.from(organization)
				.where(
					and(
						eq(organization.slug, slug),
						eq(organization.status, "validated"),
					),
				);
			if (!row) {
				throw new OrganizationError("NOT_FOUND");
			}
			return profileOf(row);
		},

		async list(page: { cursor?: string; limit: number }) {
			const offset = offsetOf(page.cursor);
			const rows = await db
				.select()
				.from(organization)
				.where(eq(organization.status, "validated"))
				.orderBy(asc(organization.name), asc(organization.id))
				.limit(page.limit + 1)
				.offset(offset);
			return {
				items: rows.slice(0, page.limit).map(profileOf),
				nextCursor: rows.length > page.limit ? `o${offset + page.limit}` : null,
			};
		},

		async mine(ownerId: string) {
			const rows = await db
				.select()
				.from(organization)
				.where(eq(organization.ownerId, ownerId))
				.orderBy(asc(organization.createdAt));
			return rows.map(ownOf);
		},

		admin: {
			async list(page: {
				cursor?: string;
				limit: number;
				status?: OrganizationStatus;
			}) {
				const offset = offsetOf(page.cursor);
				const rows = await db
					.select({ row: organization, ownerName: user.name })
					.from(organization)
					.leftJoin(user, eq(user.id, organization.ownerId))
					.where(page.status ? eq(organization.status, page.status) : undefined)
					// Applications waiting for a decision first, oldest first.
					.orderBy(
						sql`(${organization.status} = 'pending') DESC`,
						asc(organization.createdAt),
						asc(organization.id),
					)
					.limit(page.limit + 1)
					.offset(offset);
				return {
					items: rows.slice(0, page.limit).map(
						({ row, ownerName }): AdminOrganization => ({
							...ownOf(row),
							ownerName,
							version: row.version,
							system: row.system,
						}),
					),
					nextCursor:
						rows.length > page.limit ? `o${offset + page.limit}` : null,
				};
			},

			/**
			 * One decision, audited in the same statement. The `WHERE` carries the version and the
			 * status the decision applies to, so a stale screen or a decision already taken matches no
			 * row: CONFLICT, told apart from an unknown id by a read.
			 */
			async decide(
				actorId: string,
				decision: Decision,
				input: { id: string; expectedVersion: number; reason?: string },
			): Promise<AdminOrganization> {
				const rule = DECISIONS[decision];
				const rows = await withAudit(
					db,
					{
						actorId,
						action: rule.event,
						targetType: "organization",
						targetIdColumn: "id",
						details: { fields: ["status"] },
					},
					db
						.update(organization)
						.set({
							status: rule.to,
							statusReason: input.reason ?? null,
							reviewedBy: actorId,
							reviewedAt: new Date(),
							version: sql`${organization.version} + 1`,
						})
						.where(
							and(
								eq(organization.id, input.id),
								eq(organization.version, input.expectedVersion),
								eq(organization.status, rule.from),
							),
						)
						.returning({ id: organization.id }),
				);
				if (rows.length === 0) {
					throw new OrganizationError(
						(await byId(input.id)) ? "CONFLICT" : "NOT_FOUND",
					);
				}
				return adminView(input.id);
			},
		},
	};
}
