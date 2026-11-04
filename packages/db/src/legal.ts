import { and, count, inArray, sql } from "drizzle-orm";

import type { Database } from "./index";
import { legalDocumentVersion } from "./schema/legal";

/**
 * The counters in force (#341), both starting at 1: the number of important publications of the
 * terms or privacy policy + 1 (what a Member must have accepted), and of the Organization terms + 1
 * (what an Organization must have accepted). They are derived from the versions, so a publication
 * raises them in the very statement that records it. Read by the sign-in page, the auth server and
 * the API, which cannot drift apart.
 */
export async function currentLegalVersions(db: Database) {
	const important = sql`${legalDocumentVersion.important}`;
	const [row] = await db
		.select({
			consent: count(
				sql`CASE WHEN ${important} AND ${inArray(legalDocumentVersion.document, ["terms", "privacy"])} THEN 1 END`,
			),
			organizationTerms: count(
				sql`CASE WHEN ${and(important, inArray(legalDocumentVersion.document, ["organization_terms"]))} THEN 1 END`,
			),
		})
		.from(legalDocumentVersion);
	return {
		consent: String(Number(row?.consent ?? 0) + 1),
		organizationTerms: String(Number(row?.organizationTerms ?? 0) + 1),
	};
}
