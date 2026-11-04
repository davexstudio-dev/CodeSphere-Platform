import type { Database } from "@codesphere/db";
import { sql } from "drizzle-orm";
import { SYSTEM_TAGS } from "./system-tags";

const rowsOf = <T>(result: unknown): T[] =>
	(Array.isArray(result)
		? result
		: (result as { rows: unknown[] }).rows) as T[];

type TagRow = { name: string; questionCount: number; followed: boolean };

const summary = (row: TagRow) => ({
	name: row.name,
	questionCount: Number(row.questionCount),
	followed: Boolean(row.followed),
});

/** Escapes LIKE wildcards so a typed `%` or `_` matches itself. */
const likePattern = (text: string) =>
	`%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

// A Tag with its usage count (live Questions) and whether `userId` follows it.
const selectTags = (userId: string | null, where = sql``, limit = 50) => sql`
	SELECT t.name,
		(SELECT count(*)::int FROM questions q
			WHERE q.deleted_at IS NULL AND t.name = ANY (q.tags)) AS "questionCount",
		EXISTS (SELECT 1 FROM tag_follows f
			WHERE f.tag = t.name AND f.user_id = ${userId}) AS "followed"
	FROM tag t ${where}
	ORDER BY "questionCount" DESC, t.name
	LIMIT ${limit}`;

/** Tags whose name contains `q`, most used first. `userId` is null for an anonymous caller. */
export async function searchTags(
	db: Database,
	input: { q?: string; limit: number },
	userId: string | null,
) {
	const where = input.q
		? sql`WHERE t.name ILIKE ${likePattern(input.q)}`
		: sql``;
	const rows = rowsOf<TagRow>(
		await db.execute(selectTags(userId, where, input.limit)),
	);
	return rows.map(summary);
}

/** The Tags a Member follows. */
export async function followedTags(db: Database, userId: string) {
	const rows = rowsOf<TagRow>(
		await db.execute(
			selectTags(
				userId,
				sql`WHERE t.name IN (SELECT tag FROM tag_follows WHERE user_id = ${userId})`,
				200,
			),
		),
	);
	return rows.map(summary);
}

/**
 * Follows a Tag; idempotent. `null` when the Tag does not exist. One statement: the follow is
 * inserted only for an existing Tag, and a repeated follow hits the primary key and does nothing.
 */
export async function followTag(db: Database, userId: string, name: string) {
	await db.execute(sql`
		INSERT INTO tag_follows (user_id, tag)
		SELECT ${userId}, t.name FROM tag t WHERE t.name = ${name}
		ON CONFLICT DO NOTHING`);
	const [row] = rowsOf<TagRow>(
		await db.execute(selectTags(userId, sql`WHERE t.name = ${name}`, 1)),
	);
	return row ? summary(row) : null;
}

/** Records that the Member passed the onboarding; idempotent (the first date is kept). */
export async function skipTagsOnboarding(db: Database, userId: string) {
	await db.execute(sql`
		UPDATE "user" SET tags_onboarding_skipped_at = now()
		WHERE id = ${userId} AND tags_onboarding_skipped_at IS NULL`);
}

/** Unfollows a Tag; idempotent. */
export async function unfollowTag(db: Database, userId: string, name: string) {
	await db.execute(
		sql`DELETE FROM tag_follows WHERE user_id = ${userId} AND tag = ${name}`,
	);
}

/**
 * Makes sure every Tag of a Question exists as an official Tag row; idempotent (#44).
 *
 * Runs BEFORE the Question is written, and not in the same statement: the edge database (Neon
 * over HTTP) has no transactions. If the Question then fails (validation, conflict), the Tags stay
 * with zero Questions: harmless, visible in the search, and an Admin can delete them. The reverse
 * order would be worse, a Question carrying a Tag that is not in the registry.
 */
export async function ensureTags(db: Database, names: readonly string[]) {
	if (names.length === 0) {
		return;
	}
	await db.execute(sql`
		INSERT INTO tag (name, reserved)
		SELECT DISTINCT trim(lower(n)), trim(lower(n)) = ANY (${sql.raw(`ARRAY[${SYSTEM_TAGS.map((t) => `'${t}'`).join(", ")}]::text[]`)}) FROM unnest(ARRAY[${sql.join(
			names.map((name) => sql`${name}`),
			sql`, `,
		)}]::text[]) AS n
		WHERE trim(n) <> ''
		ON CONFLICT (name) DO UPDATE SET reserved = true
			WHERE tag.reserved = false AND EXCLUDED.reserved = true`);
}
