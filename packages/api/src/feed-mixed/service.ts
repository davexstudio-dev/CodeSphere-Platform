import type { FeedPreferences, MixedFeedPage } from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import {
	FEED_AFFINITY_MAX,
	feedAffinity,
	feedMuted,
	feedPreferences,
} from "@codesphere/db/schema/feed";
import { questions, votes } from "@codesphere/db/schema/questions";
import { tagFollows } from "@codesphere/db/schema/tags";
import { watchSources } from "@codesphere/db/schema/watch";
import { and, eq, inArray, sql } from "drizzle-orm";

import { decodeHotCursor, encodeHotCursor, HOT_GRAVITY } from "../feed";
import { createListingService, InvalidCursorError } from "../questions/listing";
import { createWatchService } from "../watch/service";
import {
	AFRICAN_COUNTRIES,
	DEFAULT_FEED_RANKING,
	diversify,
	type FeedRanking,
	reasonsFor,
} from "./ranking";

type Language = "fr" | "en";
type Mute = { kind: "tag" | "source"; key: string };

const rowsOf = <T>(result: unknown): T[] =>
	(Array.isArray(result)
		? result
		: (result as { rows: unknown[] }).rows) as T[];

type Scored = {
	kind: "question" | "watch";
	id: string;
	score: number;
	tags: string[];
	source_key: string | null;
	followed_hit: string[] | null;
	learned_hit: string[] | null;
	lang_ok: boolean;
	african: boolean;
};

// A list of strings as a SQL array literal built from bound parameters.
const textArray = (values: readonly string[]) =>
	values.length === 0
		? sql`ARRAY[]::text[]`
		: sql`ARRAY[${sql.join(
				values.map((v) => sql`${v}`),
				sql`, `,
			)}]::text[]`;

export function createMixedFeedService(
	db: Database,
	ranking: FeedRanking = DEFAULT_FEED_RANKING,
) {
	const listing = createListingService(db);
	const watch = createWatchService(db);

	async function preferencesOf(userId: string) {
		const [row] = await db
			.select()
			.from(feedPreferences)
			.where(eq(feedPreferences.userId, userId))
			.limit(1);
		return {
			personalization: row?.personalization ?? true,
			language: row?.language ?? null,
		};
	}

	async function view(userId: string): Promise<FeedPreferences> {
		const prefs = await preferencesOf(userId);
		const muted = await db
			.select({ kind: feedMuted.kind, key: feedMuted.key })
			.from(feedMuted)
			.where(eq(feedMuted.userId, userId))
			.orderBy(feedMuted.createdAt);
		// A Source is shown by its name when it is one of ours.
		const ids = muted
			.filter((m) => m.kind === "source" && /^[0-9a-f-]{36}$/.test(m.key))
			.map((m) => m.key);
		const names = new Map(
			ids.length === 0
				? []
				: (
						await db
							.select({ id: watchSources.id, name: watchSources.name })
							.from(watchSources)
							.where(inArray(watchSources.id, ids))
					).map((s) => [s.id, s.name]),
		);
		return {
			...prefs,
			muted: muted.map((m) => ({
				...m,
				label:
					m.kind === "source"
						? (names.get(m.key) ?? m.key.replace(/^domain:/, ""))
						: m.key,
			})),
		};
	}

	// Defined apart so a method can be passed around without losing `this`.
	async function learn(userId: string, tags: readonly string[], delta = 1) {
		if (tags.length === 0 || !(await preferencesOf(userId)).personalization) {
			return;
		}
		await db
			.insert(feedAffinity)
			.values(
				tags.map((tag) => ({
					userId,
					tag,
					weight: Math.min(delta, FEED_AFFINITY_MAX),
				})),
			)
			.onConflictDoUpdate({
				target: [feedAffinity.userId, feedAffinity.tag],
				set: {
					weight: sql`LEAST(${FEED_AFFINITY_MAX}, ${feedAffinity.weight} + ${delta})`,
					updatedAt: new Date(),
				},
			});
	}

	return {
		view,
		learn,

		async update(
			userId: string,
			patch: { personalization?: boolean; language?: Language | null },
		) {
			// Only the fields given are written, in one statement: two concurrent partial updates
			// cannot overwrite each other with a stale copy of the other field.
			const changes = {
				...(patch.personalization === undefined
					? {}
					: { personalization: patch.personalization }),
				...(patch.language === undefined ? {} : { language: patch.language }),
			};
			await db
				.insert(feedPreferences)
				.values({ userId, ...changes })
				.onConflictDoUpdate({
					target: feedPreferences.userId,
					set: { ...changes, updatedAt: new Date() },
				});
			return view(userId);
		},

		async mute(userId: string, target: Mute) {
			await db
				.insert(feedMuted)
				.values({ userId, kind: target.kind, key: target.key })
				.onConflictDoNothing();
			return view(userId);
		},

		async unmute(userId: string, target: Mute) {
			await db
				.delete(feedMuted)
				.where(
					and(
						eq(feedMuted.userId, userId),
						eq(feedMuted.kind, target.kind),
						eq(feedMuted.key, target.key),
					),
				);
			return view(userId);
		},

		/** Whether the Member already upvoted this Question: re-sending a vote teaches nothing more. */
		async hasUpvoted(userId: string, questionId: string) {
			const [row] = await db
				.select({ value: votes.value })
				.from(votes)
				.where(
					and(
						eq(votes.userId, userId),
						eq(votes.targetType, "question"),
						eq(votes.targetId, questionId),
					),
				)
				.limit(1);
			return (row?.value ?? 0) > 0;
		},

		/** An upvoted Question teaches its Tags. */
		async learnFromQuestion(userId: string, questionId: string) {
			const [row] = await db
				.select({ tags: questions.tags })
				.from(questions)
				.where(eq(questions.id, questionId))
				.limit(1);
			if (row) {
				await learn(userId, row.tags);
			}
		},

		async mixed(
			userId: string,
			input: { cursor?: string; limit: number; language?: Language },
		): Promise<MixedFeedPage> {
			const position = input.cursor ? decodeHotCursor(input.cursor) : null;
			if (input.cursor && !position) {
				throw new InvalidCursorError();
			}
			const snapshotAt = position?.snapshotAt ?? new Date();
			const prefs = await preferencesOf(userId);
			const personal = prefs.personalization;
			const language = prefs.language ?? input.language ?? null;
			const followed = (
				await db
					.select({ tag: tagFollows.tag })
					.from(tagFollows)
					.where(eq(tagFollows.userId, userId))
			).map((f) => f.tag);
			// Off, the feed is the hot score on the followed Tags only (overall when there are none).
			const restrict = !personal && followed.length > 0;
			const fallback = !personal && followed.length === 0;

			const windowStart = new Date(
				snapshotAt.getTime() - ranking.windowDays * 86_400_000,
			);
			const at = sql`(${snapshotAt.toISOString()}::timestamptz at time zone 'utc')`;
			const hotOf = (score: SQLChunk, since: SQLChunk) =>
				sql`((${score})::float8 / power(greatest(extract(epoch from (${at} - ${since})) / 3600.0, 0) + 2, ${HOT_GRAVITY}::float8))`;
			const weights = personal
				? sql`SELECT tag, ${ranking.followedAffinity}::float8 AS w FROM tag_follows WHERE user_id = ${userId}
					UNION ALL
					SELECT tag, LEAST(weight, ${FEED_AFFINITY_MAX})::float8 * ${ranking.learnedAffinity} FROM feed_affinity WHERE user_id = ${userId}`
				: sql`SELECT tag, 0::float8 AS w FROM tag_follows WHERE user_id = ${userId}`;
			const score = personal
				? sql`c.hot * (1 + c.affinity) * (CASE WHEN c.lang_ok THEN ${ranking.languageBonus}::float8 ELSE 1 END) * (CASE WHEN c.african THEN ${ranking.africaBonus}::float8 ELSE 1 END)`
				: sql`c.hot`;
			const visible = [
				restrict
					? sql`(s.tags && ${textArray(followed)} OR s.owner = ${userId})`
					: sql`true`,
				// « Moins comme ça » is an explicit choice: it holds whatever the personalisation says.
				sql`NOT (s.tags && COALESCE((SELECT array_agg(key) FROM feed_muted WHERE user_id = ${userId} AND kind = 'tag'), ARRAY[]::text[]))
					AND NOT (s.source_key IS NOT NULL AND s.source_key IN (SELECT key FROM feed_muted WHERE user_id = ${userId} AND kind = 'source'))`,
				position
					? sql`(s.score < ${position.hot}::float8 OR (s.score = ${position.hot}::float8 AND s.id < ${position.id}))`
					: sql`true`,
			];

			const result = await db.execute(sql`
				WITH prefs AS (SELECT tag, SUM(w) AS w FROM (${weights}) x GROUP BY tag),
				cand AS (
					SELECT 'question'::text AS kind, q.id::text AS id, q.tags, q.language,
						COALESCE(u.country = ANY (${textArray(AFRICAN_COUNTRIES)}), false) AS african,
						NULL::text AS source_key, q.author_id AS owner,
						${hotOf(sql`greatest(q.score + 1, 0)`, sql`q.created_at`)} AS hot
					FROM questions q JOIN "user" u ON u.id = q.author_id
					WHERE q.deleted_at IS NULL AND q.created_at <= ${snapshotAt} AND q.created_at > ${windowStart}
					UNION ALL
					SELECT 'watch'::text, w.id::text, w.tags, w.language, w.african_source,
						COALESCE(w.source_id::text, 'domain:' || w.domain), NULL::text,
						${hotOf(sql`greatest(COALESCE((SELECT SUM(v.value) FROM watch_item_votes v WHERE v.item_id = w.id), 0) + 1, 0)`, sql`w.published_at`)}
					FROM watch_items w
					WHERE w.visibility = 'visible' AND w.published_at <= ${snapshotAt} AND w.published_at > ${windowStart}
				),
				c AS (
					SELECT cand.*,
						COALESCE((SELECT LEAST(${ranking.affinityCap}::float8, COALESCE(SUM(p.w), 0)) FROM prefs p WHERE p.tag = ANY (cand.tags)), 0) AS affinity,
						(${language}::text IS NOT NULL AND cand.language = ${language}::text) AS lang_ok
					FROM cand
				),
				s AS (SELECT c.*, ${score} AS score FROM c)
				SELECT s.kind, s.id, s.score, s.tags, s.source_key, s.lang_ok, s.african,
					(SELECT array_agg(f.tag) FROM tag_follows f WHERE f.user_id = ${userId} AND f.tag = ANY (s.tags)) AS followed_hit,
					(SELECT array_agg(a.tag) FROM feed_affinity a WHERE a.user_id = ${userId} AND a.weight > 0 AND a.tag = ANY (s.tags)) AS learned_hit
				FROM s
				WHERE ${sql.join(visible, sql` AND `)}
				ORDER BY s.score DESC, s.id DESC
				LIMIT ${input.limit + 1}`);

			const rows = rowsOf<Scored>(result).map((row) => ({
				...row,
				score: Number(row.score),
			}));
			const page = rows.slice(0, input.limit);
			const last = page.at(-1);

			const [questions, watched] = await Promise.all([
				listing.byIds(
					page.filter((r) => r.kind === "question").map((r) => r.id),
				),
				watch.byIds(
					page.filter((r) => r.kind === "watch").map((r) => r.id),
					{ id: userId },
				),
			]);
			const questionById = new Map(questions.map((q) => [q.id, q]));
			const watchById = new Map(watched.map((w) => [w.id, w]));

			const ordered = diversify(
				page.map((row) => ({
					...row,
					keys: [
						...(row.source_key ? [`source:${row.source_key}`] : []),
						...row.tags,
					],
				})),
				ranking.maxRun,
			);
			const items: MixedFeedPage["items"] = [];
			for (const row of ordered) {
				const shared = {
					reasons: personal
						? reasonsFor({
								followedTags: row.followed_hit ?? [],
								learnedTags: row.learned_hit ?? [],
								language: row.lang_ok,
								african: row.african,
							})
						: row.followed_hit?.[0]
							? [{ code: "followed_tag" as const, value: row.followed_hit[0] }]
							: [{ code: "trending" as const }],
					sourceKey: row.source_key,
				};
				if (row.kind === "question") {
					const question = questionById.get(row.id);
					if (question) {
						items.push({
							kind: "question",
							question,
							...shared,
							sourceName: null,
						});
					}
				} else {
					const item = watchById.get(row.id);
					if (item) {
						items.push({
							kind: "watch",
							item,
							...shared,
							sourceName: item.sourceName,
						});
					}
				}
			}
			return {
				items,
				nextCursor:
					rows.length > input.limit && last
						? encodeHotCursor({ snapshotAt, hot: last.score, id: last.id })
						: null,
				snapshotAt: snapshotAt.toISOString(),
				personalized: personal,
				fallback,
			};
		},
	};
}

type SQLChunk = ReturnType<typeof sql>;
