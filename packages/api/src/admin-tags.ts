import type { Database } from "@codesphere/db";
import { tag } from "@codesphere/db/schema/tags";
import { sql } from "drizzle-orm";

import { withAudit } from "./audit";

/** Normalized form shared with the Tags of a Question: trimmed, lowercase. */
export const normalizeTagName = (name: string) => name.trim().toLowerCase();

/** Tags the product relies on: kept even when no Question uses them, and never renamed. */
export const RESERVED_TAGS = ["roadmap"] as const;
const isReserved = (name: string) =>
	(RESERVED_TAGS as readonly string[]).includes(name);

export type TagRow = {
	id: string;
	name: string;
	version: number;
	questionCount: number;
	ownerHackathon: string | null;
};

export const adminTag = (row: TagRow) => ({
	id: row.id,
	name: row.name,
	version: row.version,
	questionCount: Number(row.questionCount),
	ownerHackathon: row.ownerHackathon,
});

// A Tag with its usage count and its owner, computed in one query: a Tag named like a Hackathon's
// slug belongs to that Hackathon.
const selectTags = (where = sql``) => sql`
	SELECT t.id, t.name, t.version,
		(SELECT count(*)::int FROM questions q
			WHERE q.deleted_at IS NULL AND t.name = ANY (q.tags)) AS "questionCount",
		(SELECT h.slug FROM hackathon h WHERE h.slug = t.name) AS "ownerHackathon"
	FROM tag t ${where}
	ORDER BY t.name`;

const rowsOf = (result: unknown) =>
	(Array.isArray(result)
		? result
		: (result as { rows: unknown[] }).rows) as TagRow[];

export async function listTags(db: Database) {
	return rowsOf(await db.execute(selectTags())).map(adminTag);
}

async function findTag(db: Database, id: string) {
	const [row] = rowsOf(await db.execute(selectTags(sql`WHERE t.id = ${id}`)));
	return row ? adminTag(row) : null;
}

const isUniqueViolation = (error: unknown): boolean => {
	const { code, cause } = (error ?? {}) as { code?: unknown; cause?: unknown };
	return code === "23505" || (cause !== undefined && isUniqueViolation(cause));
};

export type TagOutcome =
	| { ok: true; tag: ReturnType<typeof adminTag> }
	| { ok: false; code: "NOT_FOUND" | "CONFLICT" };

/** Creates an official Tag; a name that normalizes to an existing one is CONFLICT. */
export async function createTag(
	db: Database,
	actorId: string,
	name: string,
): Promise<TagOutcome> {
	const created = await withAudit(
		db,
		{ actorId, action: "tag.create", targetType: "tag", targetIdColumn: "id" },
		db
			.insert(tag)
			.values({ name: normalizeTagName(name) })
			.onConflictDoNothing()
			.returning({ id: tag.id }),
	);
	const id = created[0]?.id as string | undefined;
	const found = id ? await findTag(db, id) : null;
	return found ? { ok: true, tag: found } : { ok: false, code: "CONFLICT" };
}

/**
 * Renames a Tag. The `WHERE` carries the version and the "not owned by a Hackathon" rule, so a
 * stale or protected Tag matches no row (CONFLICT, told apart from an unknown id by a read). A
 * collision with another Tag's name violates the unique index: also CONFLICT, nothing written.
 */
export async function renameTag(
	db: Database,
	actorId: string,
	input: { id: string; name: string; expectedVersion: number },
): Promise<TagOutcome> {
	const before = await findTag(db, input.id);
	if (!before) {
		return { ok: false, code: "NOT_FOUND" };
	}
	if (before.ownerHackathon || isReserved(before.name)) {
		return { ok: false, code: "CONFLICT" };
	}
	const renamed = normalizeTagName(input.name);
	let changed: Record<string, unknown>[];
	try {
		changed = await withAudit(
			db,
			{
				actorId,
				action: "tag.rename",
				targetType: "tag",
				targetIdColumn: "id",
				details: { fields: ["name"] },
			},
			db
				.update(tag)
				.set({
					name: renamed,
					version: sql`${tag.version} + 1`,
				})
				.where(
					sql`${tag.id} = ${input.id} AND ${tag.version} = ${input.expectedVersion}
						AND NOT EXISTS (SELECT 1 FROM hackathon h WHERE h.slug = ${tag.name})`,
				)
				.returning({ id: tag.id }),
			// The Questions carry the Tag by name: they follow the rename, in the same statement.
			[
				sql`UPDATE questions SET tags = array_replace(tags, ${before.name}, ${renamed})
					WHERE ${before.name} = ANY (tags) AND EXISTS (SELECT 1 FROM m)`,
				// Followers follow the new name, unless they already followed it (primary key).
				sql`UPDATE tag_follows SET tag = ${renamed}
					WHERE tag = ${before.name} AND EXISTS (SELECT 1 FROM m)
					AND NOT EXISTS (SELECT 1 FROM tag_follows f2
						WHERE f2.user_id = tag_follows.user_id AND f2.tag = ${renamed})`,
				// Those who already followed the new name keep that one: their old row goes away
				// (disjoint from the rows updated above, so the two writes never meet).
				sql`DELETE FROM tag_follows
					WHERE tag = ${before.name} AND EXISTS (SELECT 1 FROM m)
					AND EXISTS (SELECT 1 FROM tag_follows f2
						WHERE f2.user_id = tag_follows.user_id AND f2.tag = ${renamed})`,
			],
		);
	} catch (error) {
		// Only the unique index (another Tag already has this name) is a CONFLICT.
		if (isUniqueViolation(error)) {
			return { ok: false, code: "CONFLICT" };
		}
		throw error;
	}
	if (changed.length === 0) {
		return { ok: false, code: "CONFLICT" };
	}
	const after = await findTag(db, input.id);
	return after ? { ok: true, tag: after } : { ok: false, code: "NOT_FOUND" };
}

/** Deletes a Tag no Question uses and no Hackathon owns, and that is not reserved; anything else is CONFLICT. */
export async function deleteTag(
	db: Database,
	actorId: string,
	id: string,
): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "CONFLICT" }> {
	const found = await findTag(db, id);
	if (!found) {
		return { ok: false, code: "NOT_FOUND" };
	}
	if (isReserved(found.name)) {
		return { ok: false, code: "CONFLICT" };
	}
	const removed = await withAudit(
		db,
		{ actorId, action: "tag.delete", targetType: "tag", targetIdColumn: "id" },
		db
			.delete(tag)
			.where(
				sql`${tag.id} = ${id}
					AND NOT EXISTS (SELECT 1 FROM questions q WHERE q.deleted_at IS NULL AND ${tag.name} = ANY (q.tags))
					AND NOT EXISTS (SELECT 1 FROM hackathon h WHERE h.slug = ${tag.name})`,
			)
			.returning({ id: tag.id }),
	);
	return removed.length > 0 ? { ok: true } : { ok: false, code: "CONFLICT" };
}
