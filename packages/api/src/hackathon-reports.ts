import type { Database } from "@codesphere/db";
import { hackathon, hackathonReport } from "@codesphere/db/schema/hackathons";
import { organization } from "@codesphere/db/schema/organizations";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { withAudit } from "./audit";

type Reason = (typeof hackathonReport.$inferInsert)["reason"];

/**
 * A Member's report on a Hackathon the public can see (#326). One per Member and Hackathon: sending
 * it again only edits a report still waiting, an Admin's decision stands. Returns false when no
 * such Hackathon is public (unknown, draft, or its Organization is suspended).
 */
export async function reportHackathon(
	db: Database,
	userId: string,
	slug: string,
	reason: Reason,
	comment: string | undefined,
) {
	const [target] = await db
		.select({ id: hackathon.id })
		.from(hackathon)
		.innerJoin(organization, eq(organization.id, hackathon.organizationId))
		.where(
			and(
				eq(hackathon.slug, slug),
				inArray(hackathon.status, ["published", "ended"]),
				eq(organization.status, "validated"),
			),
		);
	if (!target) {
		return false;
	}
	await db
		.insert(hackathonReport)
		.values({
			userId,
			hackathonId: target.id,
			reason,
			comment: comment || null,
		})
		.onConflictDoUpdate({
			target: [hackathonReport.userId, hackathonReport.hackathonId],
			set: { reason, comment: comment || null },
			setWhere: sql`${hackathonReport.outcome} IS NULL`,
		});
	return true;
}

/** The Hackathons with reports waiting, the one reported first at the top (#326). */
export async function listReportedHackathons(db: Database) {
	const rows = await db
		.select({
			hackathonId: hackathon.id,
			slug: hackathon.slug,
			name: hackathon.name,
			status: hackathon.status,
			version: hackathon.version,
			organizationName: organization.name,
			reason: hackathonReport.reason,
			comment: hackathonReport.comment,
			createdAt: hackathonReport.createdAt,
		})
		.from(hackathonReport)
		.innerJoin(hackathon, eq(hackathon.id, hackathonReport.hackathonId))
		.innerJoin(organization, eq(organization.id, hackathon.organizationId))
		.where(sql`${hackathonReport.outcome} IS NULL`)
		.orderBy(asc(hackathonReport.createdAt));
	const byHackathon = new Map<
		string,
		{
			slug: string;
			name: string;
			organizationName: string | null;
			status: "draft" | "published" | "ended" | "archived";
			version: number;
			reports: { reason: Reason; comment: string | null }[];
		}
	>();
	for (const row of rows) {
		const entry = byHackathon.get(row.hackathonId) ?? {
			slug: row.slug,
			name: row.name,
			organizationName: row.organizationName,
			status: row.status,
			version: row.version,
			reports: [],
		};
		entry.reports.push({ reason: row.reason, comment: row.comment });
		byHackathon.set(row.hackathonId, entry);
	}
	return [...byHackathon.values()];
}

/**
 * The reports on a Hackathon are not founded: they are closed as dismissed and the Hackathon stays
 * published. One statement with its audit event; false when no report was waiting.
 */
export async function dismissHackathonReports(
	db: Database,
	actorId: string,
	slug: string,
) {
	const rows = await withAudit(
		db,
		{
			actorId,
			action: "hackathon.reports_dismiss",
			targetType: "hackathon",
			targetIdColumn: "id",
		},
		db
			.update(hackathon)
			// No change: the mutation only has to name the Hackathon for the audit event.
			.set({ version: sql`${hackathon.version}` })
			.where(
				and(
					eq(hackathon.slug, slug),
					sql`EXISTS (SELECT 1 FROM hackathon_report r
						WHERE r.hackathon_id = ${hackathon.id} AND r.outcome IS NULL)`,
				),
			)
			.returning({ id: hackathon.id }),
		[
			sql`UPDATE hackathon_report SET outcome = 'dismissed'
				WHERE hackathon_id IN (SELECT id FROM m) AND outcome IS NULL`,
		],
	);
	return rows.length > 0;
}
