import type { Database } from "@codesphere/db";
import { questions } from "@codesphere/db/schema/questions";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

// Full-text search and near-duplicate detection on Postgres (#247, map #221). The engine sits behind
// the `SearchIndex` port, which returns ids only: an external engine (Meilisearch, Typesense…) can
// replace it if a measured threshold is crossed (#232) without touching the callers.

export type SearchInput = {
	text: string;
	language?: "fr" | "en";
	limit: number;
	offset: number;
};

export type SearchIndex = {
	/** Ids of the live Questions matching `text`, most relevant first. */
	search(input: SearchInput): Promise<string[]>;
	/** Ids of live Questions whose title is close to `title`, closest first. */
	similarTitles(input: { title: string; limit: number }): Promise<string[]>;
};

export class InvalidSearchCursorError extends Error {}

/** The offset an opaque search cursor stands for (`o<offset>`); bounded, a search is read page by page. */
export function decodeSearchCursor(cursor: string | undefined) {
	if (cursor === undefined) {
		return 0;
	}
	const match = /^o(\d{1,4})$/.exec(cursor);
	if (!match) {
		throw new InvalidSearchCursorError();
	}
	return Number(match[1]);
}

export const encodeSearchCursor = (offset: number) => `o${offset}`;

/** Shorter than this, a text says too little to match on (nor to compare titles with). */
export const MIN_SEARCH_LENGTH = 3;
export const MIN_TITLE_LENGTH = 8;

// Lower-cased and stripped of accents: the form the trigram index is built on (migration
// fulltext_search). The expression must match the index's character for character.
const normalised = (text: ReturnType<typeof sql>) =>
	sql`lower(public.immutable_unaccent(${text}))`;
const titleOf = normalised(sql`${questions.title}`);
const vector = sql`${questions}.search_vector`;

export function createPostgresSearchIndex(db: Database): SearchIndex {
	return {
		async search({ text, language, limit, offset }) {
			const trimmed = text.trim();
			if (trimmed.length < MIN_SEARCH_LENGTH) {
				return [];
			}
			const fr = sql`plainto_tsquery('public.fr_unaccent'::regconfig, ${trimmed})`;
			const en = sql`plainto_tsquery('public.en_unaccent'::regconfig, ${trimmed})`;
			const words = normalised(sql`${trimmed}`);
			// A Question is matched with the configuration of its own language (stems differ), or,
			// for a typo the stems cannot absorb, by the words of the query appearing near-verbatim
			// in its title.
			const rank = sql<number>`(CASE ${questions.language}
				WHEN 'fr' THEN ts_rank_cd(${vector}, ${fr})
				ELSE ts_rank_cd(${vector}, ${en})
			END + word_similarity(${words}, ${titleOf}))`;
			const rows = await db
				.select({ id: questions.id })
				.from(questions)
				.where(
					and(
						isNull(questions.deletedAt),
						language ? eq(questions.language, language) : undefined,
						sql`(
							(${questions.language} = 'fr' AND ${vector} @@ ${fr})
							OR (${questions.language} = 'en' AND ${vector} @@ ${en})
							OR ${words} <% ${titleOf}
						)`,
					),
				)
				.orderBy(desc(rank), desc(questions.createdAt), desc(questions.id))
				.limit(limit)
				.offset(offset);
			return rows.map((row) => row.id);
		},

		async similarTitles({ title, limit }) {
			const trimmed = title.trim();
			if (trimmed.length < MIN_TITLE_LENGTH) {
				return [];
			}
			const wanted = normalised(sql`${trimmed}`);
			const rows = await db
				.select({ id: questions.id })
				.from(questions)
				.where(
					and(
						isNull(questions.deletedAt),
						// `%` uses the trigram index and pg_trgm's similarity threshold (0.3).
						sql`${titleOf} % ${wanted}`,
					),
				)
				.orderBy(
					desc(sql`similarity(${titleOf}, ${wanted})`),
					desc(questions.id),
				)
				.limit(limit);
			return rows.map((row) => row.id);
		},
	};
}
