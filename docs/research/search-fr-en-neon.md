# Research: FR/EN full-text search and near-duplicate detection on Neon (HTTP, edge)

Resolves #221 (map #218). Status: research note, not a decision. Date: 2026-10-17.

## Question

Which Postgres full-text options (tsvector, unaccent, pg_trgm, pgvector) work on the Neon HTTP database the Worker uses
(`packages/db/src/edge.ts`, no interactive transactions), what are the performance and cost limits, and what is a plan for FR/EN
ranking and near-duplicate question detection while typing? When do vectors become useful?

Legend: **[V]** verified against the cited primary source on 2026-10-17; **[U]** unverified / general knowledge, measure before relying on it.
Repo facts are from `origin/develop` @ 087394d.

## Short answer

- All four options are available on Neon: `pg_trgm` 1.6 and `unaccent` 1.1 on PG14-18, `pgvector` (extension name `vector`) 0.8.0
  (0.8.6 on PG18). tsvector/GIN is core Postgres. None of them needs a transaction or a WebSocket: they are plain SQL, so
  `neon-http` runs them. [V]
- Recommended now: **tsvector + GIN with a custom FR/EN configuration that chains `unaccent`, ranked with `ts_rank_cd`, plus `pg_trgm`
  on the title for the "similar questions" box.** No vectors in the MVP.
- Vectors (`pgvector` + an embedding model) become useful only when lexical search misses *meaning* (synonyms, FR question vs EN
  duplicate, paraphrases) and there is enough content for that to hurt: order of magnitude 10k+ questions, [U] a judgment, not a
  documented threshold. Until then they add a model dependency, a write-path call and storage for little gain.
- The memory note "no transactions on the edge DB" needs one nuance: Neon's HTTP driver *does* offer non-interactive transactions
  (`sql.transaction([...])`); what it cannot do is interactive ones. Search needs neither. See section 1.

## 1. What runs over Neon HTTP

- `neon()` (HTTP) sends each query as one fetch request; it works as a tagged template or `sql.query()`. WebSockets (`Pool`/`Client`)
  give sessions and interactive transactions. [V] https://neon.com/docs/serverless/serverless-driver
- `sql.transaction()` over HTTP runs several queries in one *non-interactive* transaction (array of queries, isolation level and
  read-only settable). Interactive multi-statement transactions need the WebSocket pool. [V] same page. Whether
  `drizzle-orm/neon-http` exposes this as `db.batch([...])` is [U], check before use.
- Max request and response size over HTTP: 64 MB. [V] same page. Irrelevant for a search returning 10-20 rows.
- Extensions are installed per database: `CREATE EXTENSION pg_trgm; CREATE EXTENSION unaccent; CREATE EXTENSION vector;`. Neon lists
  pg_trgm 1.6 and unaccent 1.1 on PG14-18 and `vector` 0.8.0 (PG14-17) / 0.8.6 (PG18), no caveats listed. [V]
  https://neon.com/docs/extensions/pg-extensions , https://neon.com/docs/extensions/pgvector
- Consequences: `SET pg_trgm.similarity_threshold` or `SET hnsw.ef_search` are session settings, and with HTTP every query is a fresh
  request, so a `SET` in a previous call is lost. Pass thresholds as explicit arguments (`similarity(a,b) > 0.4`) or use `SET LOCAL`
  inside a single `sql.transaction([...])` batch. [U, follows from the one-request-per-query model; the pgvector README itself
  suggests `SET LOCAL` in a transaction for per-query settings [V] https://github.com/pgvector/pgvector]
- Migrations (`CREATE EXTENSION`, `CREATE INDEX`) run through the normal migration path, not the Worker, so the HTTP limits do not
  matter for index builds.

## 2. Full-text search with tsvector (core Postgres)

- `websearch_to_tsquery` takes raw user text, "never raises syntax errors", supports `"phrase"`, `OR` and `-term`. It is the right
  entry point for a search box. [V] https://www.postgresql.org/docs/current/textsearch-controls.html
- Ranking: `ts_rank` (term frequency) and `ts_rank_cd` (cover density, adds proximity; needs positions, so it ignores stripped
  tsvectors). Default weights `{D,C,B,A} = {0.1, 0.2, 0.4, 1.0}`; normalization flags are a bit mask (1 divides by 1+log(length), 2 by
  length, 32 maps to rank/(rank+1), cosmetic only). `setweight(..., 'A'..'D')` labels title vs body. [V] same page
- Cost warning from the docs: ranking "requires consulting the tsvector of each matching document, which can be I/O bound and
  therefore slow", almost unavoidable. Mitigation: rank only the top candidates (filter, `LIMIT`, then rank), or filter by tag/status
  first. `ts_headline` re-reads the original document, "can be slow and should be used with care", and its output is not safe HTML
  (sanitize). [V] same page. Our `bodyHtml` is already sanitized; do not headline over `bodyHtml` with an unsanitized path.
- Index choice: GIN is "the preferred text search index type"; it stores lexemes, not weights, so queries using weights need a row
  recheck. GiST is lossy (signature, 124 bytes default). [V] https://www.postgresql.org/docs/current/textsearch-indexes.html
- Expression index vs stored column: an expression GIN index on `to_tsvector('cfg', ...)` costs less disk but recomputes
  `to_tsvector` to verify matches; a `GENERATED ALWAYS AS (...) STORED` tsvector column is faster to query and costs disk. The
  two-argument (named config) form is mandatory in indexes. [V] https://www.postgresql.org/docs/current/textsearch-tables.html
- GIN writes: with `fastupdate` (default) new entries sit in a pending list that searches must also scan; an insert that overflows
  `gin_pending_list_limit` pays an immediate cleanup; autovacuum keeps it small. Question inserts are low-rate, so this is a
  non-issue at our scale; `fastupdate=off` trades slower writes for stable read latency. [V]
  https://www.postgresql.org/docs/current/gin.html (the default value of the limit is not on that page, [U]).
  Build time is "very sensitive" to `maintenance_work_mem`. [V] same page.

## 3. French and English: unaccent and configurations

- `unaccent` is a *filtering dictionary*: it strips diacritics and passes the lexeme on to the next dictionary in the chain. The
  docs' own example builds a French configuration:
  ```sql
  CREATE TEXT SEARCH CONFIGURATION fr ( COPY = french );
  ALTER TEXT SEARCH CONFIGURATION fr
      ALTER MAPPING FOR hword, hword_part, word WITH unaccent, french_stem;
  ```
  [V] https://www.postgresql.org/docs/current/unaccent.html . The rules file is UTF-8, default `unaccent.rules` covers most European
  languages (Æ becomes AE).
- This puts unaccenting *inside the text search configuration*, so `to_tsvector('fr_unaccent', ...)` stays a named-config call and is
  index-safe, unlike the bare `unaccent(col)` function (declared STABLE, so not directly indexable; the usual workaround is an
  IMMUTABLE SQL wrapper that pins the dictionary and a reindex if the rules change). The volatility is not stated on the unaccent
  page, [U] general PostgreSQL knowledge, verify with `\df+ unaccent`.
- Built-in `french` and `english` configurations are listed by `\dF`; the config chapter does not enumerate them. [V for the
  mechanism] https://www.postgresql.org/docs/current/textsearch-configuration.html . Mixed languages are handled by choosing the
  configuration per document or per query, and an index can use a config stored in a column (`to_tsvector(config_name, body)`). [V]
  https://www.postgresql.org/docs/current/textsearch-tables.html
- Our schema already stores `questions.language` (`'fr' | 'en'`, `packages/db/src/schema/questions.ts`), so the per-row
  configuration choice needs no language detection at write time. [V, repo]
- Stemming caveats [U]: stemmers over-stem or under-stem technical tokens (`c++`, `node.js`, `useEffect`, error codes). Keep the
  tags array as a separate exact-match signal and weight it high.

## 4. pg_trgm: typo tolerance and near-duplicates

- `similarity()`, `word_similarity()`, `strict_word_similarity()` return 0..1; operators `%` (default threshold 0.3), `<%` (0.6) and
  `<<%` (0.5); distance operators `<->`, `<<->`, `<<<->`. Non-alphanumerics are ignored when extracting trigrams. Comparisons are
  case-insensitive in a default build. [V] https://www.postgresql.org/docs/current/pgtrgm.html
- Indexes: both `gin_trgm_ops` and `gist_trgm_ops` accelerate `%`, `<%`, `<<%`, `LIKE`/`ILIKE`. Only **GiST** supports ordering by
  distance (`ORDER BY title <-> $1 LIMIT 5`, "quite efficient" for the closest few); with GIN use `WHERE t % $1 ORDER BY
  similarity(t, $1) DESC`. [V] same page
- The page says nothing about accents or multibyte text. Run trigrams on an unaccented, lowercased form so "résumé" and "resume"
  collide: either a generated column `title_norm` or an IMMUTABLE unaccent wrapper in the index expression. [U] test with our
  encoding before relying on it.
- Neon recommends `LIMIT` to cap the cost of similarity over large sets. [V] https://neon.com/docs/extensions/pg_trgm

## 5. pgvector: capabilities and cost

- Index types: HNSW (better speed-recall, slower build, more memory, creatable on an empty table) and IVFFlat (faster build, less
  memory, lower query performance, build after data exists). Without an index it is exact search with perfect recall. [V]
  https://neon.com/docs/extensions/pgvector
- Limits: `vector` up to 2,000 dimensions indexable, `halfvec` 4,000, `bit` 64,000. HNSW defaults `m=16`, `ef_construction=64`,
  `hnsw.ef_search=40`. [V] same page
- Storage: `vector` = 4 x dims + 8 bytes; `halfvec` = 2 x dims + 8. Indexes need not fit in memory but are faster when they do. [V]
  https://github.com/pgvector/pgvector . Worked example [derived]: 1024 dims in `halfvec` = 2,056 bytes/question, so 100k questions
  is about 200 MB of vectors before the HNSW index (roughly the same again [U]).
- Filtering: with approximate indexes the `WHERE` applies after the index scan, so a 10% filter at `ef_search=40` returns about 4
  rows; enable `hnsw.iterative_scan` (`strict_order`/`relaxed_order`). [V] pgvector README. Under HTTP that setting needs `SET
  LOCAL` in a batch (section 1).
- Cosine distance operator `<=>`, ops class `vector_cosine_ops`. [V] README
- Index build wants `maintenance_work_mem` close to the working set (but under 50-60% of RAM); available on every Neon plan. [V]
  Neon page.
- The real cost is the **embedding call**, not Postgres: every question write and every typed query needs an embedding. Cloudflare
  Workers AI `@cf/baai/bge-m3` ("Multi-Linguality") costs $0.0118 per million input tokens, 60,000-token context; the page gives
  neither languages nor output dimension (BAAI documents 1024, [U]). [V] https://developers.cloudflare.com/workers-ai/models/bge-m3/
  Embedding on every keystroke is wasteful: embed on pause or on blur only.

## 6. Cost and performance limits that apply to us

- Neon plans (shown 2026-10-17): Free = 1 GB storage per project, 100 CU-hours/project/month, autoscaling to 2 CU (8 GB), scale to zero
  after 5 min, not disableable; Launch = $0.35/GB-month, $0.106/CU-hour, can disable scale-to-zero; Scale = $0.222/CU-hour. 1 CU is
  about 4 GB RAM. [V] https://neon.com/docs/introduction/plans
- Cold start after scale-to-zero "typically takes a few hundred milliseconds" on top of network (their `psql` example: about
  0.75-0.87 s total). A first keystroke after idle can therefore be slow: debounce, do not show an error, and keep search tolerant of
  a late answer. Disabling scale-to-zero needs a paid plan. [V] https://neon.com/docs/connect/connection-latency
- Worker budget: CPU time per request is 10 ms on Workers Free vs 30 s default on Paid (waiting on the network does not count);
  50 vs 10,000 subrequests; 128 MB per isolate. [V] https://developers.cloudflare.com/workers/platform/limits/ . Search done in SQL
  costs the Worker almost no CPU; avoid ranking/merging large result sets in JS. This ties to the Paid-plan note in
  `docs/research/workers-staging.md`.
- 1 GB free storage is the binding constraint for vectors, not for tsvector/trigram indexes (text-sized) [U, sizes depend on corpus;
  measure with `pg_relation_size`].

## 7. Plan

### Phase 1: lexical FR/EN search (MVP, no vectors)

1. Migration: `CREATE EXTENSION unaccent; CREATE EXTENSION pg_trgm;` and two configurations `fr_unaccent`, `en_unaccent` (copy
   `french`/`english`, map `hword, hword_part, word` to `unaccent` then the stemmer, as in section 3).
2. Stored generated column on `questions`, per-row language:
   ```sql
   search tsvector GENERATED ALWAYS AS (
     CASE language
       WHEN 'fr' THEN setweight(to_tsvector('fr_unaccent', title), 'A') || setweight(to_tsvector('fr_unaccent', body), 'C')
       ELSE           setweight(to_tsvector('en_unaccent', title), 'A') || setweight(to_tsvector('en_unaccent', body), 'C')
     END) STORED
   ```
   plus `CREATE INDEX ... USING GIN (search)`. Add tags as weight `B` (join the array to text). [U] check the generated-column
   immutability check accepts the CASE over a text column (it should: only named-config calls); confirm in a migration test.
   Drizzle has no first-class generated tsvector, so use a custom SQL migration (our repo already ships raw migrations, check
   `packages/db/src/migrations`).
3. Query: because a reader's query language is unknown, build the query in both configs and OR them:
   `search @@ (websearch_to_tsquery('fr_unaccent', $q) || websearch_to_tsquery('en_unaccent', $q))`, rank with
   `ts_rank_cd(search, query, 32)`, then blend with the hot `score` and recency. Rows stem only with their own language, so a French
   query matches French rows via the French half and English rows via the English half. Exclude `deleted_at IS NOT NULL`.
4. Rank only a bounded candidate set (`LIMIT 200` by match, then order) to respect the "ranking is I/O bound" warning. Highlight
   snippets (`ts_headline`) only on the final 10 rows and sanitize.
5. Tag/language filters stay ordinary indexed predicates.

### Phase 2: near-duplicate detection while typing (still lexical)

- Trigger: debounce about 300-400 ms, minimum about 15 characters of title, abort in-flight requests (HTTP queries are
  independent so stale answers must be dropped client-side). [U] UX parameters, tune with real use.
- Query: on a normalized title column `title_norm` (lowercase + unaccent), GiST or GIN trigram index:
  `WHERE title_norm % $1` (or `<%` for partial titles) then `ORDER BY similarity(title_norm,$1) DESC LIMIT 5`; GiST allows
  `ORDER BY title_norm <-> $1 LIMIT 5` directly. At our scale either works; pick GiST if the KNN form is wanted, GIN for read-heavy.
- Add a second signal: the tsvector OR-query (`plainto`-style terms joined with `|`, ranked) to catch same-topic questions with
  different wording; show the union, trigram hits first. Present as "similar questions", never block submission.
- Pass the threshold explicitly (`similarity(...) > 0.35`) rather than `SET`, because of the HTTP statelessness. Tune thresholds on
  a labelled sample of real FR/EN duplicate pairs once the corpus exists; the 0.3 default is a starting point, not a recommendation.
- Same endpoint, read-only, no transaction: runs on `neon-http` unchanged.

### Phase 3: vectors, when and how

Introduce pgvector only when at least one holds (all thresholds [U], judgment):

- Measured miss rate: reviewers/moderators regularly find duplicates that phase 2 did not surface (FR question vs EN duplicate, or
  paraphrase with no shared words). Cross-language duplicates are the strongest trigger: stemmers and trigrams cannot bridge FR and EN.
- Corpus large enough (order of 10k+ questions) that "related questions" quality matters to retention.
- Budget for an embedding call per write (Workers AI or other) and storage (1 GB on Free is tight, see section 5).

Shape when adopted: `halfvec(1024)` column, embed `title + first 500 chars of body` once on create/edit (async, after the write, via
`ctx.waitUntil`), HNSW with `halfvec_cosine_ops` [U for the exact ops-class name, check README], use exact search with no index until
a few thousand rows ([V] exact is the default and perfect-recall), and **hybrid** results: top-k from tsvector + top-k from vectors,
merged by reciprocal rank fusion [U]. Keep trigram on the title for the type-ahead; use the vector for "related questions" and for
submit-time duplicate review, where latency matters less than on each keystroke.

## 8. Open items

- Confirm on a Neon branch: `CREATE EXTENSION` privileges, generated-column acceptance of the CASE expression, `\df+ unaccent`
  volatility, index sizes on seeded data (`packages/db/src/seed`).
- Decide whether search lives in a raw-SQL repository function (Drizzle cannot express `@@`, `ts_rank_cd` nicely; use `sql` template).
- Check `db.batch` / `sql.transaction` exposure in `drizzle-orm/neon-http` before relying on `SET LOCAL`.
- Benchmark p50/p95 of the search endpoint on the Worker against a seeded Neon branch, warm and after cold start.
