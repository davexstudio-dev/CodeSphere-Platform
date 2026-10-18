# Research: CADEV 2026 update (delta vs 2026-10-03)

Issue: #234 (child of map #218). Research date: 2026-10-17. Baseline: `docs/research/dorahacks-systalink.md` (2026-10-03).
Legend: [V] verified on an official first-party source read today; [U] unverified (secondary, partial, or contradicted).

## TL;DR

- The submission deadline is unchanged: **25 Oct 2026 17:00 GMT** [V] (rules art. 3, FR and EN). Peer vote, jury scoring and results dates are unchanged too [V].
- **New: a "Campagne de l'equipe et vote du public" window, 27 to 30 Oct 2026 23:59 GMT** [V]. The baseline had no public-vote dates.
- **The rules were edited.** They now have **13 articles** (baseline: 14). The prize article (5,000,000 FCFA, exclusive transfer of economic rights to Systalink, payment within 30 days) **no longer appears in the rules** [V]; the 5,000,000 FCFA figure remains on the landing page and in its meta description [V], but the IP-transfer condition is no longer stated anywhere I could read [V for absence in rules text; U whether it moved to another document]. Articles were renumbered (fraud is now art. 10, was 11; non-winners art. 9, was 10; promo art. 8, was 9). Art. 9 still cross-refers to "article 11" for fraud: a stale reference [V].
- **Still not published**: imposed subject/theme, submission form fields, pitch and demo-video duration/format, public-vote URL, jury names, hashtags set by the organizer [all U/missing; see section 4].
- The rules chunk is **no longer** at `/_next/static/chunks/089u7-3lg1544.js` (HTTP 404). The rules text is now embedded in the landing HTML itself (RSC payload, prop `reglement`), in both `/fr/` and `/en/` pages [V].

## 1. Method

- Fetched `https://systalink.com/fr/coupe-afrique-des-developpeurs-cadev` and the `/en/` page with plain HTTP on 2026-10-17 (HTTP 200). Extracted the Next.js flight payload (`self.__next_f.push`) and the `reglement` object; flattened to text and compared by hand with the baseline's summary (the old chunk is gone, so a byte-level diff was impossible; the comparison is against the baseline's table and article numbers).
- Compared FR and EN rules: same 13 articles and Annexe 1, same dates, same numbers [V].
- `https://platform.systalink.com/sign-up?from=cadev-landing`, `/sign-in?...`, `/`: all return the same 4.8 KB client-rendered shell ("Systalink | Cloud Marketplace"); no readable content without JavaScript or login [V].
- `https://systalink.com/sitemap.xml` (lastmod 2026-10-17T10:39Z, 192 URLs): the only CADEV URL is the landing page; no theme, vote, jury, news or announcement page exists [V].
- Social: LinkedIn company page read through a fetch summarizer (partial, auto-summarized) ; YouTube and Instagram pages return no CADEV content; X/TikTok not readable without login. Social findings are therefore [U].

## 2. What is new or changed

| Topic | Baseline (2026-10-03) | Now (2026-10-17) | Status |
|---|---|---|---|
| Submission deadline | 25 Oct 17:00 GMT | Unchanged: "du 29 septembre 2026 au 25 octobre 2026 a 17 h 00 GMT. Aucune inscription ni soumission n'est acceptee apres cette heure." Landing page countdown not re-checked in a browser; the text rule is [V] | [V] |
| Peer vote | 25 Oct 18:00 to 26 Oct 23:59 | Unchanged | [V] |
| Public vote window | Not dated | **27 to 30 Oct 2026 23:59 GMT**, labelled "Campagne de l'equipe et vote du publique" (typo "publique" is in the source) | [V] |
| Jury scoring | 31 Oct 00:00 to 1 Nov 23:59 | Unchanged | [V] |
| Results | 2 Nov | Unchanged | [V] |
| Jury list | Promised by 30 Oct (art. 3) / before submissions close (art. 7) | Both statements still present and still inconsistent (art. 3: "au plus tard le 30 octobre 2026"; art. 7: "avant la cloture des soumissions"). No names published | [V] statements, names missing |
| Number of articles | 14 + Annexe 1 | 13 + Annexe 1 | [V] |
| Prize / IP transfer article | Art. 8: 5,000,000 FCFA gross, conditional on exclusive transfer of economic rights; payment within 30 days; signature within 30 days | **Absent** from the rules. Art. 4 still mentions "Avant toute attribution de prix, chaque membre de l'equipe laureate justifie de son identite"; art. 4 still has the prize split key. Landing page still shows "5 000 000 FCFA ... Pour l'equipe gagnante" and meta description "5 millions FCFA a gagner" | [V] absence in rules; [U] whether the IP transfer applies elsewhere |
| Eligibility | 18+, francophone Africa nationality or residence, Datacloud account | Unchanged | [V] |
| Team size | 2 to 5 | Unchanged in rules (2 to 5). Social posts say 5 or "3 to 5": contradicted by the rules | [V] rules; social [U] |
| Datacloud hosting | At least one paid Datacloud product; condition of admissibility | Unchanged, now phrased "acquis au moment de la soumission aux conditions preferentielles de l'article 8" | [V] |
| Third-party licences | Permissive ok; GPL/AGPL/LGPL inadmissible | Unchanged | [V] |
| AI usage | Free but declared | Unchanged (declare tools and parts; no bonus or penalty; jury assesses team's mastery) | [V] |
| Discounts | -40% until close; -70% results to 31 Dec 2026 | Unchanged in rules (art. 8). Landing page still says "-70% ... pendant toute l'annee 2026" | [V] |
| Non-winners' rights | Art. 10 | Art. 9; adds: Systalink does not access non-winners' source code except with consent or to check suspected fraud; ideas not appropriable, Systalink free to build similar solutions | [V] (the added sentences may pre-date the baseline; the baseline did not record them) |
| Fraud | Art. 11, 48h to respond | Art. 10, 48h to respond; adds loss of prize and of unused promo benefits | [V] |
| Annexe 1 weights | 25/30/20/15/10 | Unchanged; each criterion scored /20 by each juror, jury score = mean | [V] |
| Cancellation | not recorded | Art. 12: Systalink may modify, suspend or cancel; on cancellation Datacloud sums paid for art. 6 services refunded or converted to credit | [V] (may pre-date baseline) |

Wording caveat: the baseline summarised the rules; where this table says "adds", the addition may already have existed on 3 Oct without being recorded. Only the article count (14 to 13), the numbering shift, the missing prize/IP article and the new public-vote window are demonstrably different.

## 3. Public vote: exactly what is published

All from rules art. 7 and art. 3 [V]:
- Stage 2 "Selection nationale": the projects retained after the peer vote (top 3 per national group; all if the group has 3 or fewer admissible projects) are put to the public vote and scored by the jury.
- "Le public vote sans creer de compte ; chaque vote est confirme par courriel."
- The public vote counts for at most 10% of the final score, whatever the number of votes.
- Window: "Campagne de l'equipe et vote du publique : du 27 au 30 octobre 2026 a 23 h 59" (GMT, Dakar time).
- Anti-fraud: art. 10 lists "creation de comptes multiples, manipulation des votes, plagiat..." as fraud; disqualification after 48h to respond. No technical anti-fraud mechanism (captcha, rate limit, one vote per email) is published [U/missing].
- Peer vote (different from the public vote): each team member gets up to 10 random projects of the national group (own project excluded) and must vote for one; no vote by a member means the team is excluded.

Not published: the vote URL, where the voting page lives (landing page vs platform), how many votes one email may cast, whether a vote is per project or per voter, and what "campagne de l'equipe" requires from teams. These are [U/missing]. Platform pages are login-gated or JS-only, so they could not be read.

## 4. Items asked by the issue

| Item | Finding | Status |
|---|---|---|
| Imposed subject/theme | Rules art. 2 and Annexe 1 still refer to "le sujet communique par l'Organisateur" / "au regard du sujet". The landing page still has the button "Decouvrir le theme" with copy "Decouvre le theme, les consignes et prepare ta strategie avant le lancement", pointing at sign-up. No theme text anywhere on the landing page, rules or sitemap. A LinkedIn summary says posts only frame a call to "construis avec ou sans IA" with no formal theme | Missing [V that it is not on public pages] |
| Submission form fields | Not published. What the rules require at submission: deployed, online-accessible solution on at least one paid Datacloud product (art. 6); per-member authorship declaration (not made under an employer/client/school mission, else written authorisation); list of third-party components and licences; declaration of AI tools used and project parts concerned; in registration: single representative, prize split key, represented country (art. 4). A repo link, README or any field list is not mentioned | Required declarations [V]; actual form fields missing |
| Pitch and demo video duration/format | No mention of a pitch, a demo video, a duration or a format anywhere in the rules or landing page (searched `pitch`, `video`, `demo`, `duree`, `minute`) | Missing [V] that it is absent from public texts |
| Public vote mechanism | See section 3 | Partly [V] |
| Jury composition | Not published; deadline statements inconsistent (30 Oct vs before submission close). Recusal rule: a juror recuses from any project with a personal or professional link (art. 7). The landing page lists "Sponsors officiels" (logos only; same set as baseline: Atos and Systalink) | Missing |
| Official channels | Landing page footer/links: LinkedIn `linkedin.com/company/systalink`, X `x.com/systalink`, Instagram `instagram.com/systalink`, TikTok `tiktok.com/@systalink1`, YouTube `youtube.com/@Systalink`; WhatsApp `wa.me/message/WSOC6M6ISOC7H1`; contact `cadev@systalink.com`; claims to `cadev@systalink.com` within 30 days of results. Instagram bio reads "Inscris toi a la coupe d'Afrique des developpeurs" | [V] links exist on the official page; posts [U] |
| Hashtags | Not set by the rules or landing page. Seen on Systalink's LinkedIn posts (via summarizer): `#CADEV2026`, `#CaDev2026`, `#Systalink`, `#AfriqueFrancophone`, `#Hackathon`, `#VibeCoding`, `#CloudSouverain`; a web search also surfaced a founder LinkedIn post using `#CADEV2026` | [U] |
| Changes to dates or deadline | None to the 25 Oct 17:00 GMT deadline; only an added public-vote window. Rules say any schedule change is published on the Contest page and notified to registered participants (art. 3); no such notice is on the public page | [V] |

## 5. Contradictions between official page and social posts [U]

From the LinkedIn summary (not authoritative; summarised by a model, unverifiable here):
- "Ages 18-30" appears in a partner post; the rules say 18+ (no upper limit) [V rules].
- Team size "3 to 5" or "five" in posts vs 2 to 5 in rules [V rules].
- "Projects hosted on Systalink Cloud (Dakar server)" vs rules: at least one Datacloud product of the team's choice, VPS outside Dakar allowed.
Treat the rules as the controlling text; confirm with cadev@systalink.com if any of this matters.

## 6. Still missing (ask the organizer or re-check after login)

1. Imposed subject/theme and "consignes" (behind sign-up, per the landing copy; platform shell is JS-only and was not entered).
2. Submission form fields, repo/README/video requirements, pitch and demo-video duration and format.
3. Public-vote URL, per-email vote limit, technical anti-fraud measures, what "campagne de l'equipe" requires.
4. Jury names and the true publication deadline (30 Oct vs before 25 Oct).
5. Whether the exclusive IP transfer for the winner still applies (removed from rules text) and where the prize terms now live. Worth asking cadev@systalink.com because it affects the winning team's rights.
6. Official hashtag(s) and a first-party announcement feed (none on the site or in the sitemap).
7. The landing countdown element was not rendered in a browser; only the rules text and baseline's recorded value support the 25 Oct 17:00 GMT.

## Sources

- Landing page FR: <https://systalink.com/fr/coupe-afrique-des-developpeurs-cadev> (fetched 2026-10-17)
- Landing page EN: <https://systalink.com/en/coupe-afrique-des-developpeurs-cadev> (fetched 2026-10-17)
- Sitemap: <https://systalink.com/sitemap.xml>; robots: <https://systalink.com/robots.txt>
- Platform shell: <https://platform.systalink.com/sign-up?from=cadev-landing>
- Systalink LinkedIn: <https://linkedin.com/company/systalink> [U, summarised]
- Systalink Instagram: <https://www.instagram.com/systalink/> [U]
- Baseline: `docs/research/dorahacks-systalink.md`
