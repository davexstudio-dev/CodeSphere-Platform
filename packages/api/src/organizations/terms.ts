import type { OrganizationTerms } from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import { currentLegalVersions } from "@codesphere/db/legal";
import { user } from "@codesphere/db/schema/auth";
import { organizationTermsAcceptance } from "@codesphere/db/schema/organizations";
import { and, eq } from "drizzle-orm";

import { withAudit } from "../audit";

/** What an Organization has accepted of the terms in force (#326). */
export async function termsOf(
	db: Database,
	organizationId: string,
): Promise<OrganizationTerms> {
	const { organizationTerms: version } = await currentLegalVersions(db);
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
				eq(organizationTermsAcceptance.version, version),
			),
		);
	return {
		version,
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
	const { organizationTerms: version } = await currentLegalVersions(db);
	await withAudit(
		db,
		{
			actorId,
			action: "organization.terms_accept",
			targetType: "organization",
			targetIdColumn: "organization_id",
			details: { to: version },
		},
		db
			.insert(organizationTermsAcceptance)
			.values({
				organizationId,
				version,
				acceptedBy: actorId,
			})
			.onConflictDoNothing()
			.returning({
				organization_id: organizationTermsAcceptance.organizationId,
			}),
	);
	return termsOf(db, organizationId);
}
