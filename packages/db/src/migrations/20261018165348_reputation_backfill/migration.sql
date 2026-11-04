-- Reputation backfill (#239): replays the Votes and acceptances written before the journal existed,
-- with the rules of settleVote / settleAcceptance (packages/api/src/reputation/service.ts) and the
-- points of REPUTATION_POINTS as of 2026-10-18. Only humans earn; one's own content earns nothing.
-- Idempotent: a source that already has events is skipped, so a later settlement only appends the
-- difference.
WITH v AS (
	SELECT
		v.user_id AS voter,
		v.target_type,
		v.target_id,
		v.value,
		v.created_at,
		COALESCE(q.author_id, a.author_id) AS author
	FROM votes v
	JOIN "user" vu ON vu.id = v.user_id AND vu.kind = 'human'
	LEFT JOIN questions q ON v.target_type = 'question' AND q.id = v.target_id
	LEFT JOIN answers a ON v.target_type = 'answer' AND a.id = v.target_id
	WHERE NOT EXISTS (
		SELECT 1 FROM reputation_events e
		WHERE e.cause = 'vote' AND e.actor_id = v.user_id
			AND e.target_type = v.target_type AND e.target_id = v.target_id
	)
),
voted AS (
	SELECT v.*, au.kind = 'human' AS author_human
	FROM v
	JOIN "user" au ON au.id = v.author
	WHERE v.author <> v.voter
)
INSERT INTO reputation_events (user_id, kind, points, cause, actor_id, target_type, target_id, created_at)
SELECT author, 'upvote_received', CASE WHEN target_type = 'answer' THEN 10 ELSE 5 END,
	'vote', voter, target_type, target_id, created_at
FROM voted WHERE value > 0 AND author_human
UNION ALL
SELECT author, 'downvote_received', -2, 'vote', voter, target_type, target_id, created_at
FROM voted WHERE value < 0 AND author_human
UNION ALL
SELECT voter, 'downvote_cast', -1, 'vote', voter, target_type, target_id, created_at
FROM voted WHERE value < 0;
--> statement-breakpoint
WITH accepted AS (
	SELECT
		q.id AS question_id,
		q.author_id AS asker,
		qu.kind = 'human' AS asker_human,
		a.author_id AS answerer,
		au.kind = 'human' AS answerer_human
	FROM questions q
	JOIN answers a ON a.id = q.accepted_answer_id AND a.deleted_at IS NULL
	JOIN "user" qu ON qu.id = q.author_id
	JOIN "user" au ON au.id = a.author_id
	WHERE q.deleted_at IS NULL
		AND a.author_id <> q.author_id
		AND NOT EXISTS (
			SELECT 1 FROM reputation_events e
			WHERE e.cause = 'accept' AND e.actor_id = q.author_id
				AND e.target_type = 'question' AND e.target_id = q.id
		)
)
INSERT INTO reputation_events (user_id, kind, points, cause, actor_id, target_type, target_id)
SELECT answerer, 'answer_accepted', 15, 'accept', asker, 'question', question_id
FROM accepted WHERE answerer_human
UNION ALL
SELECT asker, 'accept_given', 2, 'accept', asker, 'question', question_id
FROM accepted WHERE asker_human;
