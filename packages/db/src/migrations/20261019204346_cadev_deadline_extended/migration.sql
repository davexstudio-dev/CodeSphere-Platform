-- CADEV 2026: the organisers moved the submission deadline from 25 October to 15 November 2026 and
-- opened the contest to English-speaking developers. The seed never overwrites an existing row, so
-- the existing database is moved here. Only while the deadline is still the original one: an Admin
-- who already edited the calendar from the back-office keeps their dates.
-- The announcement gives the new submission deadline only: the votes and the jury, which follow it,
-- move by the same 21 days until the organisers publish their calendar (Admin back-office).
WITH cadev AS (
	SELECT h.id
	FROM "hackathon" h
	JOIN "hackathon_milestone" m ON m."hackathon_id" = h."id" AND m."key" = 'submission_close'
	WHERE h."slug" = 'cadev-2026' AND m."starts_at" = TIMESTAMP '2026-10-25 17:00:00'
), moved AS (
	UPDATE "hackathon_milestone" m
	SET "starts_at" = m."starts_at" + INTERVAL '21 days',
		"ends_at" = m."ends_at" + INTERVAL '21 days'
	FROM cadev
	WHERE m."hackathon_id" = cadev.id
	RETURNING m."hackathon_id"
)
UPDATE "hackathon" h
SET "summary" = CASE
		WHEN h."summary" = 'Concours en ligne pour équipes de développeurs de l''Afrique francophone.'
		THEN 'Concours en ligne pour équipes de développeurs africains, francophones et anglophones.'
		ELSE h."summary"
	END,
	"source_note" = 'Calendrier communiqué par les organisateurs. Clôture des soumissions repoussée au 15 novembre 2026 ; dates des votes et du jury décalées d''autant en attendant le calendrier officiel.',
	"verified_at" = TIMESTAMP '2026-10-19 00:00:00',
	"version" = h."version" + 1
WHERE h."id" IN (SELECT DISTINCT "hackathon_id" FROM moved);
