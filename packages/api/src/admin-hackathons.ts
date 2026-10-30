import type {
	Hackathon,
	HackathonCreate,
	HackathonUpdate,
} from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import {
	hackathon,
	hackathonCriterion,
	hackathonMilestone,
} from "@codesphere/db/schema/hackathons";
import { organization } from "@codesphere/db/schema/organizations";
import { hackathonSubmissions } from "@codesphere/db/schema/teams";
import { and, count, eq, type SQL, sql } from "drizzle-orm";
import type * as z from "zod";

import { type AuditEvent, withAudit } from "./audit";
import { ALL_STATUSES, loadHackathons } from "./hackathons";

type Update = z.infer<typeof HackathonUpdate>;
type Current = z.infer<typeof Hackathon>;

const loadAny = (db: Database, slug: string) =>
	loadHackathons(db, { slug, statuses: ALL_STATUSES }, 1);

const SCALARS = [
	"name",
	"summary",
	"teamMin",
	"teamMax",
	"sourceUrl",
	"sourceNote",
	"verifiedAt",
	"opensAt",
	"teamsEnabled",
] as const;

const same = (a: unknown, b: unknown) =>
	JSON.stringify(a) === JSON.stringify(b);
const iso = (value: string) => new Date(value).toISOString();
const isoOrNull = (value: string | null) => (value ? iso(value) : null);

export type HackathonUpdateOutcome =
	| { ok: true; hackathon: Current }
	| { ok: false; code: "NOT_FOUND" }
	| { ok: false; code: "CONFLICT"; version: number }
	| { ok: false; code: "BAD_REQUEST"; path: string; message: string };

/**
 * Applies an Admin edit to a Hackathon (#124). Reads the current state to know what changed,
 * then writes the Hackathon, its children and the audit events in one statement guarded by
 * `version = expectedVersion`: an edit made in between matches no row and gets CONFLICT.
 * Events: `hackathon.update` with the changed fields, one `milestone.update` per changed Milestone.
 */
export async function updateHackathon(
	db: Database,
	actorId: string,
	input: Update,
): Promise<HackathonUpdateOutcome> {
	const [current] = await loadAny(db, input.slug);
	if (!current) {
		return { ok: false, code: "NOT_FOUND" };
	}
	if (current.version !== input.expectedVersion) {
		return { ok: false, code: "CONFLICT", version: current.version };
	}

	const teamMin = input.teamMin ?? current.teamMin;
	const teamMax = input.teamMax ?? current.teamMax;
	if (teamMin > teamMax) {
		return {
			ok: false,
			code: "BAD_REQUEST",
			path: "teamMin",
			message: "teamMin cannot exceed teamMax.",
		};
	}

	// The organizer is an Organization an Admin has validated (#257).
	let organizationId: string | undefined;
	if (
		input.organizationSlug !== undefined &&
		input.organizationSlug !== current.organizationSlug
	) {
		const [org] = await db
			.select({ id: organization.id })
			.from(organization)
			.where(
				and(
					eq(organization.slug, input.organizationSlug),
					eq(organization.status, "validated"),
				),
			)
			.limit(1);
		if (!org) {
			return {
				ok: false,
				code: "BAD_REQUEST",
				path: "organizationSlug",
				message: "The organizer must be a validated Organization.",
			};
		}
		organizationId = org.id;
	}

	const next = {
		...input,
		verifiedAt: input.verifiedAt && iso(input.verifiedAt),
		// null clears the opening; undefined leaves it.
		opensAt: input.opensAt ? iso(input.opensAt) : input.opensAt,
	};
	const fields: string[] = SCALARS.filter(
		(field) => next[field] !== undefined && !same(next[field], current[field]),
	);
	if (organizationId) fields.push("organization");

	const milestones = input.milestones?.map((m) => ({
		...m,
		startsAt: iso(m.startsAt),
		endsAt: isoOrNull(m.endsAt),
	}));
	const isDraft = current.status === "draft";
	const replaceMilestones =
		isDraft && milestones && !same(milestones, current.milestones)
			? milestones
			: null;
	if (replaceMilestones) fields.push("milestones");
	if (milestones && !isDraft) {
		const keys = (list: { key: string }[]) =>
			list
				.map((m) => m.key)
				.sort()
				.join();
		if (
			new Set(milestones.map((m) => m.key)).size !== milestones.length ||
			keys(milestones) !== keys(current.milestones)
		) {
			return {
				ok: false,
				code: "BAD_REQUEST",
				path: "milestones",
				message: "Milestones keep their keys: none can be added or removed.",
			};
		}
	}
	const changedMilestones = (isDraft ? [] : (milestones ?? [])).flatMap(
		(m, position) => {
			const index = current.milestones.findIndex((c) => c.key === m.key);
			const before = current.milestones[index];
			const changed = (["label", "startsAt", "endsAt"] as const).filter(
				(field) => !same(m[field], before?.[field]),
			);
			const moved = index !== position;
			return changed.length || moved
				? [
						{
							...m,
							position,
							fields: moved ? [...changed, "position"] : changed,
						},
					]
				: [];
		},
	);

	const prizesChanged = input.prizes && !same(input.prizes, current.prizes);
	const criteriaChanged =
		input.criteria && !same(input.criteria, current.criteria);
	if (prizesChanged) fields.push("prizes");
	if (criteriaChanged) fields.push("criteria");

	if (!fields.length && !changedMilestones.length) {
		return { ok: true, hackathon: current };
	}

	const set: Partial<typeof hackathon.$inferInsert> = organizationId
		? { organizationId }
		: {};
	for (const field of SCALARS) {
		if (fields.includes(field)) {
			Object.assign(set, {
				[field]:
					field === "verifiedAt"
						? new Date(next.verifiedAt ?? "")
						: field === "opensAt"
							? next.opensAt
								? new Date(next.opensAt)
								: null
							: next[field],
			});
		}
	}
	const mutation = db
		.update(hackathon)
		.set({ ...set, version: sql`${hackathon.version} + 1` })
		.where(
			and(
				eq(hackathon.slug, input.slug),
				eq(hackathon.version, input.expectedVersion),
			),
		)
		.returning({ id: hackathon.id });

	const steps: SQL[] = [];
	if (replaceMilestones) {
		// One statement sees one snapshot: a DELETE then INSERT of the same key would break the
		// unique constraint, so the kept keys are upserted and only the others deleted.
		const keys = replaceMilestones.map((m) => sql`${m.key}::text`);
		steps.push(
			replaceMilestones.length
				? sql`DELETE FROM hackathon_milestone WHERE hackathon_id IN (SELECT id FROM m) AND key NOT IN (${sql.join(keys, sql`, `)})`
				: sql`DELETE FROM hackathon_milestone WHERE hackathon_id IN (SELECT id FROM m)`,
		);
		if (replaceMilestones.length) {
			const rows = replaceMilestones.map(
				(m, position) =>
					sql`(${m.key}::text, ${m.label}::text, ${m.startsAt}::timestamp, ${m.endsAt}::timestamp, ${position}::int)`,
			);
			steps.push(sql`
				INSERT INTO hackathon_milestone (hackathon_id, key, label, starts_at, ends_at, position)
				SELECT m.id, v.key, v.label, v.starts_at, v.ends_at, v.position
				FROM m CROSS JOIN (VALUES ${sql.join(rows, sql`, `)}) AS v(key, label, starts_at, ends_at, position)
				ON CONFLICT (hackathon_id, key) DO UPDATE
				SET label = EXCLUDED.label, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, position = EXCLUDED.position
			`);
		}
	}
	if (changedMilestones.length) {
		const rows = changedMilestones.map(
			(m) =>
				sql`(${m.key}::text, ${m.label}::text, ${m.startsAt}::timestamp, ${m.endsAt}::timestamp, ${m.position}::int)`,
		);
		steps.push(sql`
			UPDATE hackathon_milestone AS hm
			SET label = v.label, starts_at = v.starts_at, ends_at = v.ends_at, position = v.position
			FROM (VALUES ${sql.join(rows, sql`, `)}) AS v(key, label, starts_at, ends_at, position)
			WHERE hm.hackathon_id IN (SELECT id FROM m) AND hm.key = v.key
		`);
	}
	if (prizesChanged && input.prizes) {
		steps.push(
			sql`DELETE FROM hackathon_prize WHERE hackathon_id IN (SELECT id FROM m)`,
		);
		if (input.prizes.length) {
			const rows = input.prizes.map(
				(p, position) =>
					sql`(${p.label}::text, ${p.amount}::text, ${p.conditions}::text, ${position}::int)`,
			);
			steps.push(sql`
				INSERT INTO hackathon_prize (hackathon_id, label, amount, conditions, position)
				SELECT m.id, v.label, v.amount, v.conditions, v.position
				FROM m CROSS JOIN (VALUES ${sql.join(rows, sql`, `)}) AS v(label, amount, conditions, position)
			`);
		}
	}
	if (criteriaChanged && input.criteria) {
		steps.push(
			sql`DELETE FROM hackathon_criterion WHERE hackathon_id IN (SELECT id FROM m)`,
		);
		if (input.criteria.length) {
			const rows = input.criteria.map(
				(c, position) =>
					sql`(${c.label}::text, ${c.weight}::int, ${c.scoredBy}::text, ${position}::int)`,
			);
			steps.push(sql`
				INSERT INTO hackathon_criterion (hackathon_id, label, weight, scored_by, position)
				SELECT m.id, v.label, v.weight, v.scored_by, v.position
				FROM m CROSS JOIN (VALUES ${sql.join(rows, sql`, `)}) AS v(label, weight, scored_by, position)
			`);
		}
	}

	const events: AuditEvent[] = [
		...(fields.length
			? [
					{
						actorId,
						action: "hackathon.update",
						targetType: "hackathon",
						targetIdColumn: "id",
						details: { fields },
					},
				]
			: []),
		...changedMilestones.map((m) => ({
			actorId,
			action: "milestone.update",
			targetType: "milestone",
			targetId: `${input.slug}:${m.key}`,
			details: { fields: m.fields },
		})),
	];

	const written = await withAudit(db, events, mutation, steps);
	if (!written.length) {
		// Edited between our read and our write: the version guard matched nothing.
		const [latest] = await loadAny(db, input.slug);
		return {
			ok: false,
			code: "CONFLICT",
			version: latest?.version ?? current.version,
		};
	}
	const [updated] = await loadAny(db, input.slug);
	return updated
		? { ok: true, hackathon: updated }
		: { ok: false, code: "NOT_FOUND" };
}

/** Every Hackathon for the back-office, drafts included, with its number of Submissions (#325). */
export async function listAdminHackathons(db: Database) {
	const [items, counts] = await Promise.all([
		loadHackathons(db, { statuses: ALL_STATUSES }, 100),
		db
			.select({ slug: hackathon.slug, total: count() })
			.from(hackathonSubmissions)
			.innerJoin(hackathon, eq(hackathon.id, hackathonSubmissions.hackathonId))
			.groupBy(hackathon.slug),
	]);
	const bySlug = new Map(counts.map((c) => [c.slug, c.total]));
	return items.map((item) => ({
		...item,
		submissionCount: bySlug.get(item.slug) ?? 0,
	}));
}

/** What a new Hackathon starts from: the usual weights, to adjust before publishing. */
const DEFAULT_CRITERIA = [
	{ label: "Pertinence", weight: 25, scoredBy: "jury" },
	{ label: "Qualité technique", weight: 30, scoredBy: "jury" },
	{ label: "Expérience utilisateur", weight: 20, scoredBy: "jury" },
	{ label: "Innovation", weight: 15, scoredBy: "jury" },
	{ label: "Vote du public", weight: 10, scoredBy: "public" },
];

export type HackathonWriteOutcome =
	| { ok: true; hackathon: Current }
	| { ok: false; code: "NOT_FOUND" }
	| { ok: false; code: "CONFLICT"; version: number }
	| { ok: false; code: "BAD_REQUEST"; path: string; message: string };

/** Creates a draft (#325) and its starting children in one audited statement. */
export async function createHackathon(
	db: Database,
	actorId: string,
	input: z.infer<typeof HackathonCreate>,
): Promise<HackathonWriteOutcome> {
	const refuse = (path: string, message: string) => ({
		ok: false as const,
		code: "BAD_REQUEST" as const,
		path,
		message,
	});
	if (input.teamMin > input.teamMax) {
		return refuse("teamMin", "teamMin cannot exceed teamMax.");
	}
	const [org] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(
			and(
				eq(organization.slug, input.organizationSlug),
				eq(organization.status, "validated"),
			),
		)
		.limit(1);
	if (!org) {
		return refuse(
			"organizationSlug",
			"The organizer must be a validated Organization.",
		);
	}
	const closes = iso(input.submissionClose);
	const criteria = DEFAULT_CRITERIA.map(
		(c, position) =>
			sql`(${c.label}::text, ${c.weight}::int, ${c.scoredBy}::text, ${position}::int)`,
	);
	const written = await withAudit(
		db,
		{
			actorId,
			action: "hackathon.create",
			targetType: "hackathon",
			targetIdColumn: "id",
		},
		db
			.insert(hackathon)
			.values({
				slug: input.slug,
				name: input.name,
				organizationId: org.id,
				summary: input.summary,
				status: "draft",
				teamMin: input.teamMin,
				teamMax: input.teamMax,
				sourceUrl: input.sourceUrl,
				teamsEnabled: input.teamsEnabled,
				verifiedAt: new Date(),
			})
			.onConflictDoNothing({ target: hackathon.slug })
			.returning({ id: hackathon.id }),
		[
			sql`
				INSERT INTO ${hackathonMilestone} (hackathon_id, key, label, starts_at, position)
				SELECT m.id, 'submission_close', 'Clôture des soumissions', ${closes}::timestamp, 0 FROM m
			`,
			sql`
				INSERT INTO ${hackathonCriterion} (hackathon_id, label, weight, scored_by, position)
				SELECT m.id, v.label, v.weight, v.scored_by, v.position
				FROM m CROSS JOIN (VALUES ${sql.join(criteria, sql`, `)}) AS v(label, weight, scored_by, position)
			`,
		],
	);
	if (!written.length) {
		return refuse("slug", "This slug is already taken.");
	}
	const [created] = await loadAny(db, input.slug);
	return created
		? { ok: true, hackathon: created }
		: { ok: false, code: "NOT_FOUND" };
}

const NEXT_STATUS = {
	draft: "published",
	published: "ended",
	ended: "archived",
} as const;

/** Moves a Hackathon one status forward, never back (#325). Guarded by its version, audited. */
export async function advanceHackathon(
	db: Database,
	actorId: string,
	input: { slug: string; expectedVersion: number },
): Promise<HackathonWriteOutcome> {
	const [current] = await loadAny(db, input.slug);
	if (!current) {
		return { ok: false, code: "NOT_FOUND" };
	}
	if (current.version !== input.expectedVersion) {
		return { ok: false, code: "CONFLICT", version: current.version };
	}
	if (current.status === "archived") {
		return {
			ok: false,
			code: "BAD_REQUEST",
			path: "status",
			message: "An archived Hackathon has no next status.",
		};
	}
	if (current.status === "draft") {
		const total = current.criteria.reduce((sum, c) => sum + c.weight, 0);
		if (current.milestones.length === 0 || total !== 100) {
			return {
				ok: false,
				code: "BAD_REQUEST",
				path: current.milestones.length === 0 ? "milestones" : "criteria",
				message: "Publishing needs a Milestone and criteria that total 100.",
			};
		}
	}
	const written = await withAudit(
		db,
		{
			actorId,
			action: "hackathon.status",
			targetType: "hackathon",
			targetIdColumn: "id",
			details: { fields: ["status"] },
		},
		db
			.update(hackathon)
			.set({
				status: NEXT_STATUS[current.status],
				version: sql`${hackathon.version} + 1`,
			})
			.where(
				and(
					eq(hackathon.slug, input.slug),
					eq(hackathon.version, input.expectedVersion),
				),
			)
			.returning({ id: hackathon.id }),
	);
	const [latest] = await loadAny(db, input.slug);
	if (!written.length) {
		return {
			ok: false,
			code: "CONFLICT",
			version: latest?.version ?? current.version,
		};
	}
	return latest
		? { ok: true, hackathon: latest }
		: { ok: false, code: "NOT_FOUND" };
}
