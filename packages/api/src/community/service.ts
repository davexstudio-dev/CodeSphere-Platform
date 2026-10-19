import { MIN_MEMBERS_PER_COUNTRY } from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import {
	type CommunityFigures,
	communitySnapshots,
} from "@codesphere/db/schema/community";
import { answers, questions, votes } from "@codesphere/db/schema/questions";
import { and, eq, isNull, sql } from "drizzle-orm";

const DAY_MS = 86_400_000;
const ACTIVE_WINDOW_DAYS = 30;

const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10);
const round = (n: number, digits: number) => {
	const k = 10 ** digits;
	return Math.round(n * k) / k;
};

/** Computes the figures from the live tables: one pass of aggregates, no row leaves the database. */
export async function computeCommunityFigures(
	db: Database,
	now: number = Date.now(),
): Promise<CommunityFigures> {
	const since = new Date(now - ACTIVE_WINDOW_DAYS * DAY_MS);
	const human = and(eq(user.kind, "human"), isNull(user.suspendedAt));

	const {
		rows: [active],
	} = await db.execute<{ n: number }>(sql`
		SELECT COUNT(DISTINCT u.id)::int AS n
		FROM "user" u
		WHERE u.kind = 'human' AND u.suspended_at IS NULL AND (
			EXISTS (SELECT 1 FROM ${questions} q WHERE q.author_id = u.id AND q.created_at >= ${since} AND q.deleted_at IS NULL)
			OR EXISTS (SELECT 1 FROM ${answers} a WHERE a.author_id = u.id AND a.created_at >= ${since} AND a.deleted_at IS NULL)
			OR EXISTS (SELECT 1 FROM ${votes} v WHERE v.user_id = u.id AND v.created_at >= ${since})
		)`);

	const {
		rows: [qa],
	} = await db.execute<{
		questions: number;
		answered: number;
		accepted: number;
		median: number | null;
	}>(sql`
		WITH first_answer AS (
			SELECT a.question_id, MIN(a.created_at) AS at
			FROM ${answers} a WHERE a.deleted_at IS NULL GROUP BY a.question_id
		)
		SELECT
			COUNT(*)::int AS questions,
			COUNT(fa.at)::int AS answered,
			COUNT(q.accepted_answer_id)::int AS accepted,
			(PERCENTILE_CONT(0.5) WITHIN GROUP (
				ORDER BY EXTRACT(EPOCH FROM (fa.at - q.created_at)) / 60
			) FILTER (WHERE fa.at IS NOT NULL))::float AS median
		FROM ${questions} q LEFT JOIN first_answer fa ON fa.question_id = q.id
		WHERE q.deleted_at IS NULL`);

	const countries = await db
		.select({ country: user.country })
		.from(user)
		.where(and(human, sql`${user.country} IS NOT NULL`))
		.groupBy(user.country)
		.having(sql`COUNT(*) >= ${MIN_MEMBERS_PER_COUNTRY}`);

	const total = qa?.questions ?? 0;
	const answered = qa?.answered ?? 0;
	return {
		activeMembers: active?.n ?? 0,
		questions: total,
		answerRate: total === 0 ? 0 : round(answered / total, 3),
		medianFirstAnswerMinutes:
			qa?.median === null || qa?.median === undefined
				? null
				: Math.max(0, Math.round(qa.median)),
		acceptanceRate:
			answered === 0 ? 0 : round((qa?.accepted ?? 0) / answered, 3),
		countries: countries.length,
	};
}

/**
 * The figures of the day: read from the snapshot, computed and stored by the first visitor of the
 * UTC day (no scheduler). Concurrent first visitors may both compute; the first insert wins and
 * both return the stored row, so a day never shows two sets of figures.
 */
export async function communitySnapshot(
	db: Database,
	now: () => number = Date.now,
) {
	const day = utcDay(now());
	const find = () =>
		db
			.select()
			.from(communitySnapshots)
			.where(eq(communitySnapshots.day, day))
			.then((rows) => rows[0]);
	const existing = await find();
	if (existing) {
		return {
			day: existing.day,
			computedAt: existing.computedAt,
			figures: existing.data,
		};
	}
	const figures = await computeCommunityFigures(db, now());
	await db
		.insert(communitySnapshots)
		.values({ day, data: figures })
		.onConflictDoNothing();
	const stored = (await find()) ?? {
		day,
		computedAt: new Date(now()),
		data: figures,
	};
	return {
		day: stored.day,
		computedAt: stored.computedAt,
		figures: stored.data,
	};
}
