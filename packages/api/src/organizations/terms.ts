import type { OrganizationTerms } from "@codesphere/contract";
import { ORGANIZATION_TERMS_VERSION } from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import { organizationTermsAcceptance } from "@codesphere/db/schema/organizations";
import { and, eq } from "drizzle-orm";

import { withAudit } from "../audit";

/** What an Organization has accepted of the terms in force (#326). */
export async function termsOf(
	db: Database,
	organizationId: string,
): Promise<OrganizationTerms> {
	const [row] = await db
		.select({
			acceptedAt: organizationTermsAcceptance.acceptedAt,
			acceptedByName: user.name,
		})
		.from(organizationTermsAcceptance)
		.innerJoin(user, eq(user.id, organizationTermsAcceptance.acceptedBy))
		.where(
			and(
				eq(organizationTermsAcceptance.organizationId, organizationId),
				eq(organizationTermsAcceptance.version, ORGANIZATION_TERMS_VERSION),
			),
		);
	return {
		version: ORGANIZATION_TERMS_VERSION,
		accepted: Boolean(row),
		acceptedAt: row ? row.acceptedAt.toISOString() : null,
		acceptedByName: row?.acceptedByName ?? null,
	};
}

/**
 * Records that the owner accepted the terms in force, with the audit event, in one statement. A
 * second acceptance of the same version changes nothing and writes no event.
 */
export async function acceptTerms(
	db: Database,
	actorId: string,
	organizationId: string,
) {
	await withAudit(
		db,
		{
			actorId,
			action: "organization.terms_accept",
			targetType: "organization",
			targetIdColumn: "organization_id",
			details: { to: ORGANIZATION_TERMS_VERSION },
		},
		db
			.insert(organizationTermsAcceptance)
			.values({
				organizationId,
				version: ORGANIZATION_TERMS_VERSION,
				acceptedBy: actorId,
			})
			.onConflictDoNothing()
			.returning({
				organization_id: organizationTermsAcceptance.organizationId,
			}),
	);
	return termsOf(db, organizationId);
}
