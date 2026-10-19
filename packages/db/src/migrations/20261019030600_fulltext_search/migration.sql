-- Full-text search in French and English, and near-duplicate detection (#247, map #221). Verified
-- on PostgreSQL 16 (docs/research/247-fulltext-search-verification.md). unaccent and pg_trgm are
-- available on Neon.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
-- unaccent() is only STABLE: a generated column or an index needs an IMMUTABLE wrapper over the
-- fixed dictionary.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text) RETURNS text
	LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
	AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;--> statement-breakpoint
-- array_to_string() is STABLE too (it is polymorphic); for a text[] it is safe to call IMMUTABLE.
CREATE OR REPLACE FUNCTION public.immutable_join_tags(text[]) RETURNS text
	LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
	AS $$ SELECT array_to_string($1, ' ') $$;--> statement-breakpoint
CREATE TEXT SEARCH CONFIGURATION public.fr_unaccent (COPY = pg_catalog.french);--> statement-breakpoint
ALTER TEXT SEARCH CONFIGURATION public.fr_unaccent
	ALTER MAPPING FOR hword, hword_part, word WITH public.unaccent, french_stem;--> statement-breakpoint
CREATE TEXT SEARCH CONFIGURATION public.en_unaccent (COPY = pg_catalog.english);--> statement-breakpoint
ALTER TEXT SEARCH CONFIGURATION public.en_unaccent
	ALTER MAPPING FOR hword, hword_part, word WITH public.unaccent, english_stem;--> statement-breakpoint
-- The vector follows the Question's language: title (A), body (B), Tags (C). Maintained by the
-- database, so no write path can forget it.
ALTER TABLE "questions" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
	CASE "language"
		WHEN 'fr' THEN
			setweight(to_tsvector('public.fr_unaccent'::regconfig, "title"), 'A') ||
			setweight(to_tsvector('public.fr_unaccent'::regconfig, "body"), 'B') ||
			setweight(to_tsvector('public.fr_unaccent'::regconfig, public.immutable_join_tags("tags")), 'C')
		ELSE
			setweight(to_tsvector('public.en_unaccent'::regconfig, "title"), 'A') ||
			setweight(to_tsvector('public.en_unaccent'::regconfig, "body"), 'B') ||
			setweight(to_tsvector('public.en_unaccent'::regconfig, public.immutable_join_tags("tags")), 'C')
	END
) STORED;--> statement-breakpoint
CREATE INDEX "questions_search_idx" ON "questions" USING gin ("search_vector");--> statement-breakpoint
-- Trigram index on the normalised title: typos in a search and near-duplicates on typing.
CREATE INDEX "questions_title_trgm_idx" ON "questions" USING gin (lower(public.immutable_unaccent("title")) gin_trgm_ops);
