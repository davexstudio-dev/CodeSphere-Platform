# Recommendation engine without an embedded LLM

Research ticket: [#222](https://github.com/davexstudio-dev/CodeSphere-Platform/issues/222) (child of map [#218](https://github.com/davexstudio-dev/CodeSphere-Platform/issues/218); blocks #226). Researched 2026-10-17.

This is research, not legal advice. Section 6 lists what I could not verify.

## Question

Which approaches (hot score by followed tags, lightweight collaborative filtering, embeddings computed off-platform by Agents or a job) fit a small-volume community, cold start and a Postgres edge database? What data to collect, and with what privacy treatment (African laws, GDPR)? Constraint: no LLM runs inside the platform (`docs/cadev/ai-usage.md`: "La plateforme n'appelle aucun modele d'IA"; external Agents are Members under a human Owner's responsibility).

## Source legend

- **[P]** I read the primary source itself (legal text, paper, vendor documentation, source code).
- **[P-repo]** Read in this repository.
- **[I]** My inference from the sources; not stated by them.
- **[U]** Unverified.

## TL;DR

1. **Keep the current hot score as the backbone and make personalisation additive.** `feed.forYou` already ranks `(score+1)/(age_h+2)^1.5` over the Tags a Member follows, and falls back to the global hot list with no follows [P-repo: `packages/api/src/feed.ts`, `questions/listing.ts`]. It needs no model, no extra data, works from the first user, and is fully explainable. That formula is the Hacker News family (`votes / (age_h + timebase)^gravity`, gravity 1.8 in the public `news.arc`) [P: news.arc].
2. **Cheapest next step: tag affinity learned from votes and own questions/answers, blended into the hot score.** It uses data the platform already stores (`votes`, `questions.tags`, `tag_follows`), adds no new tracking table, and fixes the main weakness of follow-only feeds (members who follow nothing, or follow too few tags) [I].
3. **Item-to-item collaborative filtering is feasible but not worth it yet.** It is the right CF variant (similarity precomputed offline, cheap online lookup) [P: Linden et al.], but at community scale the co-vote matrix is too sparse to beat tags. Revisit when votes per active Member are in the tens and Members in the low thousands [I; thresholds are a judgement, not sourced].
4. **Embeddings are compatible with "no embedded LLM" if they are computed outside and written in.** Neon supports `pgvector` on every plan, with exact search by default and optional HNSW/IVFFlat indexes [P: Neon, pgvector]. At this volume exact search is enough (no index). The embedding producer would be an external Agent or a scheduled job calling the platform's API as a Member, which matches the existing agent model [P-repo: ai-usage.md]. Defer until tags demonstrably fail; it is the most expensive option in operations and in privacy surface (content sent to a third-party model) [I].
5. **Privacy: collect the minimum, keep the profile derivable and deletable, and expose a switch.** Recommendations from on-platform behaviour are "profiling" under GDPR Art. 4(4) and Senegal Law 2008-12 treats profiling as processing needing a basis, but a feed ranking is not an Art. 22 "similarly significant" decision in the normal case [P]. Do not log per-view behaviour in v1; do not process sensitive categories; offer "turn off personalisation" and delete the profile with the account.

## 1. What the platform has today

[P-repo]

- `feed.ts`: `HOT_GRAVITY = 1.5`; `hotScore(score, ageHours) = (score + 1) / (max(age,0) + 2) ** 1.5`; keyset cursor with `snapshotAt` so paging is stable.
- `questions/listing.ts`: the same expression in SQL (`hotExpr`), so the database orders and pages. `forYou(userId)` reads `tag_follows`, then calls `hot` with those tags; with none, `fallback: true` returns the global hot list.
- Schema: `tag_follows(user_id, tag, created_at)`, `votes(user_id, target_type, target_id, value, created_at)` with index on `(target_type, target_id)`, `questions.tags`, `questions.score`.
- No `pgvector` extension and no view/impression log exist in the schema.
- Runtime: Cloudflare Workers with Neon over HTTP (no interactive transactions; see the project memory note and `packages/db/src/edge.ts`).

## 2. The approaches

### 2.1 Hot score by followed tags (current)

- **Mechanism:** rank by votes over age decay, filter by followed tags.
- **Origin of the formula:** Hacker News' public ranking code computes `(score - 1)^0.8 / ((age_min + 120) / 60)^1.8` times penalty factors [P: [news.arc](https://github.com/wting/hackernews/blob/master/news.arc), lines ~262-275; a mirror of the original Arc source, not an official Y Combinator repository, so read it as the published code, not as current production]. CodeSphere's variant is simpler, with gravity 1.5 and an age offset of 2 hours.
- **Fit:** small volume: good (needs nothing but votes). Cold start of a Member: good only if they follow tags (onboarding already prompts for tags; `tags_onboarding_skipped` migration exists). Cold start of an item: a new Question has score 0, so it ranks at `1/(age+2)^1.5`; it is visible while young, but only to followers of its tags [I].
- **Weaknesses:** one rich-get-richer loop (votes feed rank feeds votes); no signal beyond explicit follows; users who skip onboarding get the global list.
- **Edge DB:** a single SQL query; already deployed.

### 2.2 Tag affinity from behaviour (recommended next step)

- **Mechanism [I]:** per Member, derive a weight per Tag from data already stored: tags of Questions they upvoted, asked or answered, plus explicit follows (highest weight), decayed by age. Rank candidate Questions by `hot * (1 + a * affinity(tags))`, keep the keyset cursor on the blended value. A bounded exploration share (some global-hot items) limits filter-bubble effects.
- **Why it fits:** it is content-based (items described by tags), which is the standard remedy for sparse interaction data and new items; the cold-start literature blends content and collaborative signals for this reason [P: Schein et al., SIGIR 2002 abstract, which I read through the University of Pennsylvania repository record/citation index and not the full text; see section 6].
- **Data:** no new collection. Can be computed in SQL on read (join `votes` -> `questions.tags`) at this volume, or materialised in a small `member_tag_affinity` table by a Cloudflare Cron Trigger [P: Cloudflare: Cron Triggers run a `scheduled()` handler; time limits for them on the Limits page: 15 minutes wall-clock for Cron Triggers, 128 MB memory].
- **Edge DB:** one query, or one nightly job writing rows. Avoid designs that need a transaction across several statements on the HTTP driver; a single `INSERT ... SELECT ... ON CONFLICT` upsert is atomic by itself [I].

### 2.3 Lightweight collaborative filtering

- **Item-to-item CF (Amazon):** build a table of similar items offline by finding items that the same customers bought together; online, look up similar items for each of the user's items, aggregate, return the most popular or correlated ones. Amazon states online computation "scales independently of the number of customers and number of items", and that the offline similar-items computation is expensive (O(N²M) worst case, near O(NM) in practice) [P: [Linden, Smith, York, IEEE Internet Computing 2003](https://www.cs.umd.edu/~samir/498/Amazon-Recommendations.pdf), a copy hosted by the University of Maryland]. Sarwar et al. (WWW 2001) is the academic source for the same idea, precomputed item-item similarity [U for details: the PDF I downloaded from GroupLens ([www10_sarwar.pdf](https://files.grouplens.org/papers/www10_sarwar.pdf)) did not extract to readable text and the ACM page returned 403].
- **Fit [I]:** the offline job is small at community scale (a co-vote table over a few thousand items runs in seconds), and a Cron Trigger can host it. The problem is signal, not compute: the same Amazon paper notes new customers "typically have extremely limited information", and CF needs overlap between Members' votes. A new community has little. CF also does nothing for a brand-new Question (no votes yet).
- **Verdict:** postpone; implement only as "people who upvoted X also upvoted Y" on Question pages if the vote volume justifies it. Never use user-user CF: it scans every Member per request [P: Linden et al., "O(MN) in the worst case"], and it discloses neighbours' behaviour more directly.

### 2.4 Embeddings computed off-platform

- **Mechanism [I]:** an Agent or a scheduled job (outside the Worker) computes a vector per Question (and optionally per Member as the mean of liked Questions), then writes them through the platform API into a `vector(n)` column. The platform only stores vectors and runs nearest-neighbour SQL (`ORDER BY embedding <=> $1`). No model runs in the Worker, so "no LLM embedded" holds; the model lives with the Agent's Owner.
- **Database support [P]:**
  - Neon: `CREATE EXTENSION IF NOT EXISTS vector;`, "available on every Neon plan with no add-on or paid tier required", enabled per database [P: [Neon pgvector docs](https://neon.com/docs/extensions/pgvector)].
  - pgvector: exact nearest-neighbour search by default; approximate HNSW and IVFFlat indexes optional; `vector` indexable up to 2,000 dimensions, `halfvec` up to 4,000; operators `<->` (L2), `<#>` (negative inner product), `<=>` (cosine); with approximate indexes "filtering is applied after the index is scanned", so tag-filtered queries can return fewer rows than requested; HNSW "has slower build times and uses more memory" [P: [pgvector README](https://github.com/pgvector/pgvector)].
  - These docs say nothing about the HTTP driver. Queries and a one-off `CREATE EXTENSION` migration are plain SQL, so I expect them to work over Neon HTTP, but I did not test it [U; verify in a spike].
- **Fit:** small volume: exact scan over a few thousand rows is trivial, so no index and no tuning [I]. Cold start of an item: good, because content alone gives a vector (the strength of this option). Cold start of a Member: only after they act, or from their stated tags.
- **Costs and risks [I]:**
  - A new write path (vectors from Agents) that needs authentication, validation (dimension, finite floats) and a quota; poisoned or low-quality vectors would degrade the feed, and anyone who can write vectors can steer ranking (a manipulation surface comparable to vote fraud).
  - Question text leaves the platform to whichever embedding model the Agent uses: a privacy and licensing matter (section 4), and a dependency on the Owner's availability.
  - Two moving parts to keep in sync (text edits require re-embedding).
- **Verdict:** a good phase 3, behind a feature flag, only if tag affinity measurably fails (for example for Members without follows, or for long-tail Questions with unusual tags).

### 2.5 Comparison

| Criterion | Hot + follows (now) | Tag affinity | Item-item CF | Off-platform embeddings |
|---|---|---|---|---|
| New data collected | none | none (reuses votes, follows) | none (reuses votes) | vectors (derived from content) |
| Member cold start | follows only | follows then behaviour | needs votes | needs actions or tags |
| Item cold start | young items shown to tag followers | same | none until voted | good (content) |
| Small volume | good | good | weak (sparse) | good (exact search) |
| Edge/HTTP DB | one query | one query or nightly upsert | nightly job | pgvector, unverified over HTTP |
| Needs extra infra | no | optional Cron | Cron | Agent/job + extension |
| Explainability | high | high ("because you follow/voted X") | medium | low |
| Privacy surface | lowest | low | low-medium | medium-high (content leaves) |

My ranking for this community: tag affinity first, embeddings second, CF last [I].

## 3. Cold start recommendations

[I] unless cited.

- New Member: fall back to global hot (already done), then use onboarding tags; consider "popular tags" suggestions during onboarding to avoid the empty-follow case.
- New Question: guarantee exposure by the age offset in the hot score (already present) and keep a small exploration slot of recent low-score items.
- Evaluate against simple baselines first: the cold-start literature argues heuristic recommenders are the right baselines [P: Schein et al. abstract, via the search record].

## 4. Data to collect and privacy

Legal background is in [`gdpr-african-laws.md`](./gdpr-african-laws.md) [P-repo]; I do not repeat it. Points that bear on recommendation:

### 4.1 Which law applies

- Senegal Law 2008-12 applies to a Dakar-hosted service whatever the members' nationality (Art. 2) and has no "legitimate interests" basis: consent or a listed necessity (Art. 33) [P-repo].
- GDPR probably does not apply by default (no targeting of the EU), but build to it anyway [P-repo, section 1.3]. Behavioural profiling of EU visitors is the factor that could make Art. 3(2)(b) "monitoring" apply, so a behavioural recommender is exactly the feature that moves that line [I, applying the EDPB reasoning summarised there].

### 4.2 What recommendation changes

- **Profiling:** GDPR Art. 4(4): "any form of automated processing of personal data consisting of the use of personal data to evaluate certain personal aspects ... in particular to analyse or predict aspects concerning that natural person's ... personal preferences, interests ... behaviour" [P: [Regulation (EU) 2016/679, OJ L 119](https://eur-lex.europa.eu/eli/reg/2016/679/oj)]. A per-Member tag-affinity profile is profiling; the hot score by followed tags is a Member-chosen filter, not an inference.
- **Automated decisions:** Art. 22(1) covers decisions "based solely on automated processing, including profiling, which produces legal effects ... or similarly significantly affects". WP29/EDPB guidance says that in many typical cases targeted advertising based on profiling will not have such an effect [P: [WP251rev.01](https://ec.europa.eu/newsroom/article29/redirection/document/49826), section on online advertising]. A question feed is lower-impact than advertising, so Art. 22 should not bite [I]. Exception to watch: any ranking that gates paid or competitive outcomes (hackathon selection, badges, access) must not be automated by this model. Senegal Art. 48 likewise bars decisions with legal effect solely on automated profiling [P-repo].
- **Objection:** Art. 21(1) gives a right to object to profiling based on Art. 6(1)(e)/(f); 21(2) is an absolute right for direct marketing profiling [P: GDPR]. Senegal offers an equivalent opposition right [P-repo, section 3.5]. Practical rule: a visible "Personalised feed" toggle; off means global hot or follows only.
- **Minimisation and retention:** Art. 5(1)(c) "adequate, relevant and limited to what is necessary"; 5(1)(e) identification "no longer than is necessary" [P: GDPR]. Senegal Art. 35 and 72 say the same [P-repo].
- **By design:** Art. 25(1)-(2) requires data protection by design and by default [P: GDPR]; defaults should be: personalisation from explicit signals only, no behavioural tracking until opt-in.
- **DPIA:** Art. 35(3)(a) requires one for systematic and extensive evaluation of personal aspects that leads to significant decisions; a tag-based feed does not meet that bar [I].
- **Transparency:** Art. 13(2)(f) asks for information on automated decision-making including profiling "at least" in the Art. 22 cases [P: GDPR]; a one-paragraph "why you see this" note in the privacy notice and a "because you follow/voted X" label are cheap and cover the principle regardless of scope [I].
- **Declaration with the CDP (Senegal):** the filing must list purposes and data categories [P-repo, section 3.3]. Adding "personalisation of the feed" with the data categories below to the existing declaration is an amendment to plan, not a new regime [I].

### 4.3 Data inventory

| Signal | Already stored | Collect for v1 | Notes |
|---|---|---|---|
| Followed tags | yes (`tag_follows`) | yes | Explicit; highest-weight signal; user-visible and editable. |
| Votes (Question/Answer) | yes (`votes`) | yes | Already public-ish interaction; derive tag affinity from it. |
| Own Questions/Answers and their tags | yes | yes | Already content the Member posted. |
| Question text | yes | only for embeddings (phase 3) | Public content, but sending it to an external model is a transfer decision for the Owner/organiser. |
| Views, dwell time, scroll | no | **no** | This is behavioural tracking; the most invasive signal and the one that most plausibly tips GDPR Art. 3(2)(b) and requires consent in Senegal. Skip until an opt-in exists. |
| Impressions/clicks for evaluation | no | aggregate only, no user id | Count per Question/day to evaluate; no per-user log. |
| Country, city | yes (profile) | no | Not needed for ranking; avoid geographic inference. |
| Sensitive categories (origin, religion, health, ...) | not collected | never | Prohibited or tightly restricted (Senegal Art. 40-41; GDPR Art. 9). Free-text tags/questions could reveal them; never infer them. |
| Embedding vectors of Members | no | avoid | A learned per-Member vector is a dense profile that is harder to explain, export and delete; derive on demand from votes instead. |

### 4.4 Controls to build with it [I]

- Toggle "personalise my feed" (default on for explicit follows; behavioural affinity can be on by default only if the privacy notice and the CDP filing cover it, otherwise opt-in).
- Delete or recompute the profile when the Member deletes the account (the foreign keys on `tag_follows` already cascade; `votes.user_id` does not cascade, so account deletion needs an explicit rule there, which the current schema comment does not settle).
- Include the profile data (affinity rows) in the existing member export (`members-export.ts`) for portability.
- Do not share Member-level signals with Agents. If Agents compute embeddings, give them public Question content only, never vote or follow rows.

## 5. Recommended path

1. **Now:** keep `forYou` as is. Improve onboarding to reduce empty follows.
2. **Phase 2 (small):** tag affinity blend (section 2.2), on-read SQL first, a Cron-built table only if latency demands; an exploration slot; the personalisation toggle; privacy notice and CDP filing text.
3. **Phase 3 (conditional):** spike pgvector on the preview database to confirm extension and queries over the HTTP driver; accept vectors only from authenticated, quota-limited Agents; exact search, no index; evaluate against the tag baseline before shipping.
4. **Not recommended now:** view/dwell tracking, per-Member embeddings, user-user CF.

Measure with the aggregate counters in 4.3 (feed click-through per Question), compared with the global hot list as baseline.

## 6. Limits of this research

- GDPR text read from the Official Journal HTML; the EUR-Lex consolidated and CELEX pages returned empty content to my fetcher.
- Sarwar et al. (2001): the PDF would not extract and the ACM page returned 403, so I cite it only as the origin of item-based CF and rely on Linden et al. for claims. Schein et al. (2002): I saw only the citation/abstract summary through a search result and could not open the repository record (403); its use here is limited to "blend content and collaborative data" and "use heuristic baselines".
- No performance test of pgvector over the Neon HTTP driver, and no measurement of real vote density: both are unknown because the community has not launched. The adoption thresholds in TL;DR 3 are judgement.
- Not checked: African laws other than those already covered in `gdpr-african-laws.md`, and whether the CDP treats feed personalisation as needing its own declaration line.
- Legal questions for a lawyer: whether behavioural affinity needs opt-in consent under Law 2008-12 Art. 33 (no legitimate-interests basis), and the status of Agents (and their model providers) as processors or recipients if Question text is sent to them.

## Sources

- Repository: `docs/cadev/ai-usage.md`, `docs/research/gdpr-african-laws.md`, `packages/api/src/feed.ts`, `packages/api/src/questions/listing.ts`, `packages/db/src/schema/tags.ts`, `packages/db/src/schema/questions.ts`.
- [Regulation (EU) 2016/679 (GDPR), OJ L 119, 4.5.2016](https://eur-lex.europa.eu/eli/reg/2016/679/oj) - Art. 4(4), 5, 13, 21, 22, 25, 35.
- [Article 29 Working Party, Guidelines on automated individual decision-making and profiling (WP251rev.01)](https://ec.europa.eu/newsroom/article29/redirection/document/49826).
- [Linden, Smith, York, "Amazon.com Recommendations: Item-to-Item Collaborative Filtering", IEEE Internet Computing, 2003](https://www.cs.umd.edu/~samir/498/Amazon-Recommendations.pdf).
- [Sarwar et al., "Item-Based Collaborative Filtering Recommendation Algorithms", WWW10, 2001](https://files.grouplens.org/papers/www10_sarwar.pdf) (not machine-readable for me).
- [Schein, Popescul, Ungar, Pennock, "Methods and Metrics for Cold-Start Recommendations", SIGIR 2002](https://repository.upenn.edu/cis_papers/135) (abstract-level only).
- [pgvector README](https://github.com/pgvector/pgvector).
- [Neon: the pgvector extension](https://neon.com/docs/extensions/pgvector).
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
- [Hacker News ranking code, news.arc (mirror)](https://github.com/wting/hackernews/blob/master/news.arc).
