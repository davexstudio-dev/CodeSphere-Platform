import { MIN_MEMBERS_PER_COUNTRY } from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
// biome-ignore lint/style/noRestrictedImports: tolerated, a Tag ranking joins the journal to the Questions it was earned on; move behind a Q&A contract (#254)
import { answers, questions } from "@codesphere/db/schema/questions";
import { reputationEvents } from "@codesphere/db/schema/reputation";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

// Public Reputation rankings (#242). Only humans who are neither suspended nor deleted appear (a
// deletion sets `suspended_at`), and only counted events add up: voided ones are cancelled.

const counted = and(isNull(reputationEvents.voidedReason));
const eligible = and(eq(user.kind, "human"), isNull(user.suspendedAt));

export class InvalidRankingCursorError extends Error {}

/** The offset a cursor stands for. The cursor is opaque to clients: `o<offset>`. */
export function decodeRankingCursor(cursor: string | undefined) {
	if (cursor === undefined) {
		return 0;
	}
	const match = /^o(\d{1,9})$/.exec(cursor);
	if (!match) {
		throw new InvalidRankingCursorError();
	}
	return Number(match[1]);
}

const encodeRankingCursor = (offset: number) => `o${offset}`;

type Ranked = {
	id: string;
	name: string;
	country: string | null;
	reputation: number;
};

function page(rows: Ranked[], offset: number, limit: number) {
	const items = rows.slice(0, limit).map((row, index) => ({
		rank: offset + index + 1,
		...row,
	}));
	return {
		items,
		nextCursor:
			rows.length > limit ? encodeRankingCursor(offset + limit) : null,
	};
}

/** Countries with enough Members to be shown, by total Reputation. */
export async function countryRanking(db: Database) {
	const total = sql<number>`COALESCE(SUM(${reputationEvents.points}), 0)::int`;
	const rows = await db
		.select({
			country: user.country,
			members: sql<number>`COUNT(DISTINCT ${user.id})::int`,
			reputation: total,
		})
		.from(user)
		.leftJoin(
			reputationEvents,
			and(eq(reputationEvents.userId, user.id), counted),
		)
		.where(and(eligible, sql`${user.country} IS NOT NULL`))
		.groupBy(user.country)
		.having(sql`COUNT(DISTINCT ${user.id}) >= ${MIN_MEMBERS_PER_COUNTRY}`)
		.orderBy(desc(total), user.country);
	return {
		items: rows.map((row) => ({
			country: row.country ?? "",
			members: row.members,
			reputation: row.reputation,
		})),
	};
}

/** The Members of a country by Reputation; empty below the minimum number of Members. */
export async function membersOfCountry(
	db: Database,
	country: string,
	offset: number,
	limit: number,
) {
	const code = country.toUpperCase();
	const [size] = await db
		.select({ n: sql<number>`COUNT(*)::int` })
		.from(user)
		.where(and(eligible, eq(user.country, code)));
	if ((size?.n ?? 0) < MIN_MEMBERS_PER_COUNTRY) {
		return { items: [], nextCursor: null };
	}
	const total = sql<number>`COALESCE(SUM(${reputationEvents.points}), 0)::int`;
	const rows = await db
		.select({
			id: user.id,
			name: user.name,
			country: user.country,
			reputation: total,
		})
		.from(user)
		.leftJoin(
			reputationEvents,
			and(eq(reputationEvents.userId, user.id), counted),
		)
		.where(and(eligible, eq(user.country, code)))
		.groupBy(user.id, user.name, user.country)
		.orderBy(desc(total), user.id)
		.limit(limit + 1)
		.offset(offset);
	return page(rows, offset, limit);
}

/** The Members by Reputation earned on a Tag: events on Questions and Answers that carry it. */
export async function membersOfTag(
	db: Database,
	tag: string,
	offset: number,
	limit: number,
) {
	const total = sql<number>`SUM(${reputationEvents.points})::int`;
	const rows = await db
		.select({
			id: user.id,
			name: user.name,
			country: user.country,
			reputation: total,
		})
		.from(reputationEvents)
		.innerJoin(user, eq(user.id, reputationEvents.userId))
		.leftJoin(
			answers,
			and(
				eq(reputationEvents.targetType, "answer"),
				eq(answers.id, reputationEvents.targetId),
			),
		)
		// The Question an event was earned on: the target itself, or the Answer's Question.
		.innerJoin(
			questions,
			eq(
				questions.id,
				sql`CASE WHEN ${reputationEvents.targetType} = 'question' THEN ${reputationEvents.targetId} ELSE ${answers.questionId} END`,
			),
		)
		.where(
			and(
				counted,
				eligible,
				sql`${tag.toLowerCase()} = ANY(${questions.tags})`,
			),
		)
		.groupBy(user.id, user.name, user.country)
		.having(sql`SUM(${reputationEvents.points}) > 0`)
		.orderBy(desc(total), user.id)
		.limit(limit + 1)
		.offset(offset);
	// A Member's country is hidden unless it is one shown publicly: a Tag ranking must not reveal
	// that a country with fewer than 5 Members exists.
	const shown = new Set((await countryRanking(db)).items.map((c) => c.country));
	return page(
		rows.map((row) => ({
			...row,
			country: row.country && shown.has(row.country) ? row.country : null,
		})),
		offset,
		limit,
	);
}
