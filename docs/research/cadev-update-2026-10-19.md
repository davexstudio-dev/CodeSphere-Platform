# Research: CADEV 2026 update (delta vs 2026-10-17)

Source: the organisers' announcement of 2026-10-19, relayed by the team (not yet re-checked against the rules text or the landing page).

- **Submission deadline moved** from 25 Oct 2026 to **15 Nov 2026**. The announcement gives a date, not an hour: 17:00 GMT is assumed unchanged (the rules art. 3 hour).
- **The contest opens to English-speaking developers.** The baseline (`dorahacks-systalink.md`) and the 2026-10-17 update said eligibility was francophone Africa; the rules text (art. 4) is not yet re-read to see how the eligibility wording changed (countries, language of the submission).
- **Not announced**: new dates for the peer vote, the public vote and the jury. The platform shifts them by the same 21 days (peer vote 15 to 16 Nov, public vote 17 to 20 Nov, jury 22 Nov) until the organisers publish their calendar; the Hackathon's `sourceNote` says so.

Applied in: `packages/db/src/seed/cadev.ts` (new databases), the migration `cadev_deadline_extended` (existing databases, only while the deadline is still 25 Oct), `docs/spec.md`, `docs/cadev/*`.

To check next: the rules and the landing page (deadline hour, eligibility, calendar of the votes), then correct the shifted dates from the back-office.
