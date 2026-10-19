import type { Hackathon, HackathonUpdate } from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import { hackathon } from "@codesphere/db/schema/hackathons";
import { organization } from "@codesphere/db/schema/organizations";
import { and, eq, type SQL, sql } from "drizzle-orm";
import type * as z from "zod";

import { type AuditEvent, withAudit } from "./audit";
import { loadHackathons } from "./hackathons";

type Update = z.infer<typeof HackathonUpdate>;
type Current = z.infer<typeof Hackathon>;

const SCALARS = [
	"name",
	"summary",
	"teamMin",
	"teamMax",
	"sourceUrl",
	"sourceNote",
	"verifiedAt",
	"opensAt",
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
	const [current] = await loadHackathons(db, { slug: input.slug }, 1);
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
	if (milestones) {
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
	const changedMilestones = (milestones ?? []).flatMap((m, position) => {
		const index = current.milestones.findIndex((c) => c.key === m.key);
		const before = current.milestones[index];
		const changed = (["label", "startsAt", "endsAt"] as const).filter(
			(field) => !same(m[field], before?.[field]),
		);
		const moved = index !== position;
		return changed.length || moved
			? [{ ...m, position, fields: moved ? [...changed, "position"] : changed }]
			: [];
	});

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
		const [latest] = await loadHackathons(db, { slug: input.slug }, 1);
		return {
			ok: false,
			code: "CONFLICT",
			version: latest?.version ?? current.version,
		};
	}
	const [updated] = await loadHackathons(db, { slug: input.slug }, 1);
	return updated
		? { ok: true, hackathon: updated }
		: { ok: false, code: "NOT_FOUND" };
}
