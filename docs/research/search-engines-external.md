# Research: external search engines (Meilisearch, Algolia, Typesense) vs Postgres for CodeSphere

Resolves #232 (map #218). Status: research note, not a decision. Date: 2026-10-17.

## Question

Compare Meilisearch, Algolia and Typesense (OpenSearch only if relevant) for CodeSphere: FR/EN search with accents and typo
tolerance, filters by Tag / language / Region, latency from West Africa, hosting (managed vs self-hosted on a Systalink server),
price at 1,000 / 50,000 / 500,000 documents, free-tier limits, sync from Postgres, Cloudflare Workers compatibility, data
sovereignty and African data laws. Starting point: `docs/research/search-fr-en-neon.md` (branch `research/search-fr-en-neon`:
Postgres `tsvector` + `unaccent` + `pg_trgm`, not redone here). Conclude with the threshold at which a dedicated engine is
justified and an abstraction boundary.

Legend: **[V]** verified against the cited primary source on 2026-10-17; **[U]** unverified / general knowledge / judgment, measure
or re-check before relying on it. Prices are list prices shown on the vendor pages that day, in USD, and can change.
Repo facts: `origin/develop` @ 7e7bb5c.

## Short answer

- **Do not add a dedicated engine for the MVP.** Postgres FTS + trigram covers FR/EN, accents, typos and tag/language/region filters
  at our expected size (see the Neon note). [U, judgment, see section 9 for the thresholds]
- When a dedicated engine is justified, **Typesense or Meilisearch self-hosted on the Systalink server** is the best fit: no per-record
  or per-search bill, data stays in Senegal, plain HTTPS API usable from Workers. **Algolia** is the lowest-effort managed option and
  the only one of the three with an African region (Johannesburg), but it is the most expensive at 500k records and ships data
  out of Senegal. [V for the regions and prices, U for the verdict]
- No vendor has a region in francophone West Africa. The nearest managed regions are Cape Town (Typesense Cloud), Johannesburg
  (Algolia) or Paris/Frankfurt (Meilisearch Cloud). [V]
- The engine must be **a derived, rebuildable index behind a port** (`SearchIndex`), fed from Postgres by an outbox. Postgres stays the
  source of truth. Section 10 gives the boundary.

## 1. Language, accents, typo tolerance, filters

| | Meilisearch | Algolia | Typesense |
|---|---|---|---|
| Typo defaults | 1 typo from 5 chars, 2 from 9 [V] | 1 typo from 4 chars, 2 from 8 (`minWordSizefor1Typo/2Typos`) [V] | `num_typos` default 2; `min_len_1typo` 4, `min_len_2typo` 7 [V] |
| Accents / diacritics | Docs pages read do not mention diacritics [V that they are silent]. Behaviour: normalizes Latin diacritics by default [U], test "résumé"/"resume" | Page read does not cover French diacritics [V that it is silent]; accent-insensitive by default [U] | Docs: set the field `locale` to *retain* diacritics, implying default folding; not confirmed explicitly [V for the quote, U for the default] |
| French handling | Language detected per document, default pipeline for whitespace languages (French not named) [V]; no French stemmer documented in pages read [U] | `ignorePlurals` off by default (`foot` != `feet`) [V]; stop-words / `queryLanguages` not in the page read [U] | `stem: true` uses Snowball stemmer chosen by field `locale`; default locale `en` "broadly supports most European languages" [V]; French stemming via `fr` locale to be tested [U] |
| Tech tokens (`c++`, `node.js`) | custom separators / dictionaries (not checked) [U] | not checked [U] | `symbols_to_index: ["+"]` keeps `c++`; `token_separators` splits `non-stick` [V] |
| Filters | filterable attributes, array filters [U, doc page 404 on first try] | facet filters [U] | `filter_by: tags:[a,b] && lang:=fr` (OR in brackets, AND with `&&`), `facet_by` with counts [V] |

Conclusion: all three do typo tolerance and filters; the FR-specific quality (stemming, accents on technical text, mixed FR/EN in
one field) is **not settled by the docs I could read** and must be tested on a labelled sample of real CodeSphere questions before
choosing. Typesense is the only one whose docs I could confirm for custom symbols and a per-field locale/stemmer. Per-field
language is needed for us anyway: `questions.language` is `'fr' | 'en'` (see the Neon note), which maps to a `lang` facet plus,
in Typesense, a `locale`/stemmer per collection or field [U for how to model it].

## 2. Latency from West Africa, regions, CDN

- **Algolia:** classic infrastructure lists 16 regions, one in Africa: South Africa, 2 data centers in Johannesburg on independent
  autonomous systems; DSN-only regions exist (Europe Netherlands, Middle East Dubai). You choose the region per application. [V]
  https://www.algolia.com/doc/guides/scaling/infrastructure/classic/servers-clusters.md
- **Typesense Cloud:** 26 regions including **Cape Town** (plus Paris, Frankfurt, London, Ireland, Milan, Spain, Zurich, Stockholm,
  Bahrain, UAE...). HA clusters of 3 to 7 nodes. [V] https://cloud.typesense.org/pricing/calculator
- **Meilisearch Cloud:** 9 regions (Frankfurt, Paris, London, Singapore, Japan, Sydney, San Francisco, New York, Sao Paulo); none in
  Africa; region cannot be changed after creation (re-index into a new project). [V]
  https://www.meilisearch.com/docs/capabilities/platform/infrastructure/regions
- **None is in Dakar, Abidjan, Lagos, Accra.** [V by omission from the three lists]. Round-trip from West Africa to Johannesburg/Cape
  Town versus Paris is an empirical question (submarine-cable routing, not a vendor claim): measure with RIPE Atlas or a real client
  in Dakar/Abidjan before choosing a region. [U]
- **CDN:** a search is a per-keystroke, per-user query; it is not cacheable at a CDN edge the way a page is. The latency lever is
  region choice, a debounce on the client and (for Algolia) searching **from the browser directly** to the vendor's DNS fan-out
  instead of through the Worker. Cloudflare's edge does not move the engine closer. [U, general knowledge]
- **Self-hosted on Systalink (Dakar):** best network distance for Senegalese users and the only option physically inside Senegal;
  worse for users elsewhere, and a single node has no geo-replication. Workers in front still run at the Cloudflare edge, so the
  Worker-to-origin hop is what you pay. [U]

## 3. Hosting and licences

- **Meilisearch:** Community Edition under MIT, free for commercial use; Enterprise Edition (sharding, S3-streaming snapshots, search
  rule previews) under a commercial licence/BUSL 1.1, not allowed in production without an agreement. Cloud plans from $20/month
  plus a 14-day no-card trial; Enterprise on quote. [V] https://github.com/meilisearch/meilisearch ,
  https://www.meilisearch.com/pricing . Collects anonymized telemetry that can be disabled. [V]
- **Typesense:** server is GPL-3.0, client libraries Apache. [V] https://github.com/typesense/typesense . **Entire index lives in RAM**
  plus a raw copy on disk; rule of thumb RAM = 2-3x the size of the *searchable* fields, at least 2 vCPU. Their examples: 1M short
  titles about 165 MB, 2.2M recipes about 900 MB. [V] https://typesense.org/docs/guide/system-requirements.html . Official Docker
  image, DEB/RPM/binaries. [V] https://typesense.org/docs/guide/install-typesense.html . GPL-3 for a server used over its API
  does not infect our code [U, general GPL reading, not legal advice].
- **Algolia:** SaaS only, closed source. Region per application, higher plans only in some regions. [V]
- **OpenSearch:** relevant only for large/log-style workloads. Managed Amazon OpenSearch Serverless has a floor of 1 OCU indexing + 1
  OCU search with redundancy (about $350/month in us-east-1 per a third-party guide) and I found no confirmation that it is offered
  in Cape Town. Self-hosted needs a JVM cluster and more RAM and ops than Typesense/Meilisearch. **Not recommended for CodeSphere's
  size.** [U, third-party figures; AWS pages not read]

## 4. Pricing at 1,000 / 50,000 / 500,000 documents

Assumptions: a "document" is one question (title + body excerpt + tags + lang + region, about 1-3 KB), updated rarely.
Searches are the free variable; I show the vendor's own unit. [U] for the search volume, it is a guess to fix later.

**Algolia** (list prices, https://www.algolia.com/pricing) [V]:
Free "Build": 10K search requests, 50K records, 5K recommendation requests per month. Grow (pay as you go): 10K requests + 100K
records included, then **$0.50 per 1K requests and $0.40 per 1K records**. Grow Plus: $1.75 per 1K requests, $0.40 per 1K records.
Elevate: annual contract, quote.

| Documents | Records cost | Notes |
|---|---|---|
| 1,000 | $0 (Free) | Free until >10K searches/month |
| 50,000 | $0 on Free for records | searches above 10K need Grow: e.g. 100K searches = (100-10)x$0.50 = **about $45/month** [derived] |
| 500,000 | (500-100)x$0.40 = **$160/month** + searches, e.g. 100K searches = $45, so **about $205/month** [derived] | search-as-you-type can multiply request counts; debounce [U] |

**Meilisearch Cloud** (https://www.meilisearch.com/pricing) [V for what the page shows]:
Cloud starts at $20/month; the page's estimator example is **$30/month for 100K documents + 50K searches**; a resource-based
example is **$23/month** (XS: 0.5 vCPU, 1 GB RAM = $18, plus $5 disk). Other sizes, overage rates and per-tier quotas are **not**
shown on the page [V that they are absent]. No permanent free tier, only a 14-day trial. Self-hosted: free (MIT).
Estimates [U]: 1,000 and 50,000 docs fit the entry tier; 500,000 docs x 3 KB is about 1.5 GB of raw text, so expect a larger
instance, price not published on the page I read.

**Typesense Cloud** (https://cloud.typesense.org/pricing/calculator) [V]: dedicated cluster priced by RAM (0.5 GB to 1024 GB per node)
and vCPU (default 2 vCPU with 1 h burst per day), HA 3 to 7 nodes, "no limits on records or operations", plus bandwidth-out line
item. **The page I fetched shows no dollar amounts**, so I cannot state a price [V]. **Free tier: first 720 cluster-hours and 10 GB
bandwidth once per account lifetime, for select configurations; then billing starts; no perpetual free tier.** [V]
https://cloud-help.typesense.org/article/how-does-the-free-tier-work . Sizing from the RAM rule: 500K questions x about 2 KB
searchable text = about 1 GB, so about 2-3 GB RAM per node [derived from the rule above]; 1K and 50K fit in the smallest node.
Read the live price in the configurator before budgeting.

**Self-hosted on Systalink:** $0 licence for all three (MIT / GPL-3); cost is the server's RAM/CPU and our time (backups,
upgrades, monitoring, TLS, single point of failure). At 500K questions the RAM need is about 2-3 GB (Typesense, above) [derived];
Meilisearch memory use was not on the pages I read [U].

Take-away: below about 50K documents and about 10K searches a month, **Algolia Free costs $0 and is the cheapest managed option**;
at 500K, Algolia is the dearest list price I could compute, while self-hosting costs only ops time.

## 5. Sync from Postgres

None of the three has a first-party Postgres connector in the pages I read, so sync is ours to build [U, absence, not an
explicit vendor statement]. Options, all feeding a rebuildable index:

1. **Transactional outbox (recommended).** A `search_outbox` table written in the same transaction as the question change; a worker
   drains it and upserts/deletes in the engine, idempotently by question id. Needs a transaction, so on the edge Neon HTTP driver use
   its non-interactive `sql.transaction([...])` batch, or do the write path on the WebSocket pool (the memory note
   "no transactions on the edge DB" is nuanced in the Neon note, section 1). [V for sql.transaction, per the Neon note]
2. **Logical replication / CDC (Debezium, etc.).** Neon can be a publisher; enabling it is irreversible, sets `wal_level=logical`,
   restarts computes, caps `max_replication_slots` and `max_wal_senders` at 10, **keeps the compute awake while a subscriber is
   connected (defeats scale-to-zero)**, deletes slots inactive for about 40 h and on branch restore. [V]
   https://neon.com/docs/guides/logical-replication-neon . A poor fit for an MVP on the free/low plan.
3. **`LISTEN/NOTIFY`.** Delivered after commit, in commit order, payload under 8000 bytes, but a notification is only seen by sessions
   listening at that moment (docs do not promise persistence for later listeners), so it is a trigger, never the only record. [V]
   https://www.postgresql.org/docs/current/sql-notify.html . It also needs a long-lived connection, which Workers do not hold.
4. **Webhook / queue from the app.** After the write, enqueue a message to **Cloudflare Queues** and a consumer updates the index.
   Queues pricing: Workers Free 10,000 operations/day, 24 h retention; Paid 1M operations/month included then $0.40 per million,
   about 3 operations per message (write, read, delete), retention 4 days default up to 14. [V]
   https://developers.cloudflare.com/queues/platform/pricing/ . Pair it with the outbox to survive lost messages. Whether the
   Worker can publish to a self-hosted engine in Dakar over public HTTPS (auth, firewall) is deployment work. [U]
5. **Nightly/periodic full reindex** from a Postgres `SELECT` as the safety net and for first load. Cheap at 500K documents. [U]

Deletions and moderation (soft-deleted, hidden questions) must be removed from the index, or filtered on a `visible` attribute;
a leak here shows hidden content. [U, design risk]

## 6. Cloudflare Workers compatibility

- All three expose a **REST API over HTTPS**, so a plain `fetch` works from a Worker regardless of SDK, and none needs a TCP
  connection from the Worker (unlike Postgres without Hyperdrive). [U, from the REST design; I did not open each vendor's API
  reference]
- **Algolia JS client v5** ships `fetch`, `worker`, `node` and `browser` builds (cdnjs listing), but an open issue reports the
  browser build being selected under a Nitro/Workers build ("XMLHttpRequest is not defined") on 5.2.x. Prefer the explicit
  `worker`/`fetch` entry or plain REST. [V for the issue and the build names, U that current versions are fixed]
  https://github.com/algolia/algoliasearch-client-javascript/issues/1548
- **typesense-js:** README does not state edge support or its HTTP layer; test it in `workerd` or call REST directly. [V that it is
  silent]
- **Worker budget** (from `docs/research/workers-staging.md`): 10 ms CPU per request on Free, 30 s on Paid; I/O waiting does not
  count; one subrequest per query is cheap. 50 subrequests per request on Free. [V per that note]
- Security: never ship an admin/write key to the browser. Algolia supports search-only/secured keys generated server-side;
  Meilisearch and Typesense have API keys with scoped actions and filters [U for the exact scoped-key features].

## 7. Data sovereignty and African data laws

Not legal advice; see `docs/research/gdpr-african-laws.md` (on `origin/develop`) for the legal analysis.

- That note concludes **Senegalese law 2008-12 is the unavoidable home law** for processing on Senegalese territory (Art. 2), with
  the CDP as authority, and that **transfers are restricted** (information in Senegal, authorisation in Cote d'Ivoire, Burkina
  Faso, Cameroon) and no breach-notification duty in SN/CI/BF/TG. [P per that note, not re-read against the statutes here]
- A managed engine in **Paris, Frankfurt, Johannesburg, Cape Town** receives whatever we index. If the index contains
  **personal data** (author name, avatar, city, email) it is a **cross-border transfer** and the vendor is a processor needing a
  contract and a declaration/authorisation depending on the country. If the index holds **only public content** (question title,
  body, tags, language, public country code), the personal-data exposure is small, but user-generated text can still contain
  personal data. [U, legal judgment; verify with a lawyer]
- Meilisearch's Paris region runs on the AWS European Sovereign Cloud and the docs steer GDPR workloads to FRA/PAR/LON, which
  helps for EU subjects but does **not** answer African transfer rules. [V for the docs' statement]
- **Self-hosted on the Systalink server in Dakar** keeps the index in Senegal, is the simplest sovereignty story, and removes a
  processor from the chain. Cost: availability and backups are ours.
- **Design lever that reduces the issue for every option:** index only what search needs (id, title, body excerpt, tags, language,
  region code, score, timestamps) and **never** the author's identity; hydrate display data from Postgres by id. This keeps the
  engine's content small and non-personal, and makes erasure a delete-by-id. [U, design recommendation]

## 8. Feature gap vs Postgres (what a dedicated engine actually adds)

From the Neon note, Postgres FTS gives stemmed ranking, accent folding (via `unaccent`), trigram typo tolerance and ordinary indexed
filters. A dedicated engine adds, with the caveats above:

- Out-of-the-box typo ranking across words, not just similarity of a short title; prefix/instant search tuned for per-keystroke.
- Facet counts (how many questions per tag/region) in one query; Typesense `facet_by` documented. [V]
- Synonyms, curated ranking, analytics, hybrid/vector search (Typesense vectors cost 7 bytes x dimensions x records in RAM,
  e.g. 384 dims x 100K = about 269 MB [V]).
- Lower, steadier query latency under load, and offloading read CPU from Neon (CU-hours are billed).

It adds: a second datastore, sync, a failure mode (stale/missing index), another secret, another vendor/processor, ops.

## 9. When does a dedicated engine become justified?

These are **judgment thresholds [U]**; the vendors publish none for "when to leave Postgres". Treat them as triggers to measure,
not rules. Move when **any one** holds, measured on production data:

1. **Latency/cost:** p95 of the search endpoint on Postgres stays above about 200-300 ms after index and query tuning, or search
   consumes a visible share of Neon CU-hours. Typical onset: order of 50K-100K indexed questions with heavy concurrent typing. 
2. **Relevance:** reviewers or a labelled FR/EN sample show Postgres missing results (typos on long words, technical tokens,
   plural/conjugation misses) that tuning of `fr_unaccent`/`en_unaccent` and trigram thresholds cannot fix.
3. **Features:** product needs facet counts on several dimensions at once, synonyms managed by editors, "did you mean", or
   multi-field instant search with highlighting beyond what `ts_headline` can do cheaply.
4. **Vectors/hybrid:** the Neon note's vector trigger (cross-language duplicates, paraphrase, 10K+ questions) arrives *and* you prefer
   one engine over `pgvector` + Workers AI embeddings.
5. **Ops:** a read-heavy search load that you want off the primary database (replica-like isolation).

Below roughly 10K-50K questions and a few searches per second, **stay on Postgres**. Between, and especially if sovereignty or cost
matters, **self-host Typesense or Meilisearch on the Systalink server**; if you need zero-ops and a Johannesburg region and the bill
is tolerable, **Algolia**. Decision between Typesense and Meilisearch should follow a **one-day bake-off** on 2-5K real FR/EN
questions (relevance, accent folding, `c++`-style tokens, RAM) since the docs do not settle it.

## 10. Recommended abstraction boundary

Keep Postgres the source of truth and make the engine a **replaceable, rebuildable projection** behind a narrow port, so the
Postgres implementation ships first and an engine can be swapped in without touching oRPC procedures or the UI.

```ts
// packages/search (or packages/api/src/search) , the only place that knows an engine exists
type SearchQuery = {
  text: string;
  lang?: 'fr' | 'en';         // filter; omit = both
  tags?: string[];            // any-of
  region?: string;            // ISO alpha-2 or 'OTHER' (questions region, see schema/auth.ts comment)
  limit: number;              // <= 50
  cursor?: string;
};
type SearchHit = { id: string; score: number; highlight?: { title?: string } }; // ids, NOT rows
interface SearchIndex {
  search(q: SearchQuery): Promise<{ hits: SearchHit[]; nextCursor?: string }>;
  similar(title: string, limit: number): Promise<SearchHit[]>;  // near-duplicate box
  upsert(doc: SearchDoc): Promise<void>;
  remove(id: string): Promise<void>;
  reindexAll(): AsyncIterable<void>;  // full rebuild from Postgres
}
```

Rules:

1. **Return ids (and optional highlights), hydrate rows from Postgres.** Authorization, soft-delete and visibility are enforced
   there, never trusted from the index.
2. **`SearchDoc` carries no personal data** (section 7) and a `visible` flag.
3. **Writes go through an outbox** (`search_outbox`) in the same transaction as the question change; a queue consumer/cron
   drains it idempotently. Postgres adapter needs no sync (index lives in the table), so the outbox is only active when an
   external adapter is configured.
4. **Adapter selected by config** (`SEARCH_BACKEND=postgres|typesense|meilisearch|algolia`), one implementation each, all passing
   one shared contract test suite on the same FR/EN fixture set (accents, typos, tag/lang/region filters). The fixture set is the
   decision tool for the bake-off in section 9.
5. **Fallback:** if the external engine errors or lags, fall back to the Postgres adapter, never to an empty list.
6. Do not leak engine query syntax (Algolia facet strings, Typesense `filter_by`) beyond the adapter.

## 11. Open items

- Run the FR/EN relevance bake-off (accent folding, stemmers, `c++`/`node.js`, mixed-language questions) on seeded data for
  Typesense and Meilisearch; confirm Algolia's French settings (`ignorePlurals`, stop words, `queryLanguages`).
- Read live Typesense Cloud and Meilisearch size-based prices (not shown on the pages fetched) and Meilisearch memory needs.
- Measure real latency from Dakar/Abidjan to Johannesburg, Cape Town, Paris, and to a Systalink Dakar node.
- Legal check: whether public question text with names inside, indexed outside Senegal, needs a CDP declaration/authorisation.
- Confirm Workers behaviour of the Algolia `worker` build and `typesense-js`; otherwise use REST.
- Decide where the outbox consumer runs (Queue consumer Worker vs cron vs Systalink host), tied to the deploy-approach decision
  (see memory on `deploy.yml` / `chore/35`).
