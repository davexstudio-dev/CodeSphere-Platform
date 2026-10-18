import type {
	ForYouPage,
	ListQuestionsInput,
	QuestionListItem,
} from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import { answers, questions } from "@codesphere/db/schema/questions";
import { tagFollows } from "@codesphere/db/schema/tags";
import {
	and,
	arrayOverlaps,
	count,
	desc,
	eq,
	ilike,
	inArray,
	isNull,
	lt,
	lte,
	or,
	type SQL,
	sql,
} from "drizzle-orm";

import { decodeCursor, encodeCursor } from "../cursor";
import { decodeHotCursor, encodeHotCursor, HOT_GRAVITY } from "../feed";
import { authorsById, UNKNOWN_AUTHOR } from "./authors";

/**
 * The words a title search matches on (#68): those of 3 characters or more, at most 5. Words are
 * split on everything but letters, digits and `+#.`, so the LIKE wildcards `%` and `_` never reach
 * the pattern. A Question matches when its title contains any of them.
 */
export function titleWords(q: string | undefined): string[] {
	if (!q) {
		return [];
	}
	const words = q
		.toLowerCase()
		.split(/[^\p{L}\p{N}+#.]+/u)
		.filter((w) => w.length >= 3);
	return [...new Set(words)].slice(0, 5);
}

/** The cursor of a list was not issued by the server. */
export class InvalidCursorError extends Error {}

type Row = typeof questions.$inferSelect;

const EXCERPT_LENGTH = 180;

/** The start of a Markdown body as plain text: no fences, links or emphasis marks. */
export function excerptOf(markdown: string): string {
	const text = markdown
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/[`*_>#~-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return text.length > EXCERPT_LENGTH
		? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…`
		: text;
}

type Extras = Pick<
	QuestionListItem,
	| "answerCount"
	| "authorName"
	| "authorKind"
	| "ownerName"
	| "authorCountry"
	| "authorReputation"
>;

function toItem(row: Row, extras: Extras): QuestionListItem {
	return {
		...extras,
		excerpt: excerptOf(row.body),
		id: row.id,
		title: row.title,
		authorId: row.authorId,
		language: row.language,
		status: row.status,
		tags: row.tags,
		version: row.version,
		score: row.score,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

// (score + 1) / (age_h + 2)^1.5, with ages measured at the snapshot. `created_at` is a UTC
// `timestamp`, so the snapshot is brought to UTC before the subtraction.
function hotExpr(snapshotAt: Date) {
	const at = sql`(${snapshotAt.toISOString()}::timestamptz at time zone 'utc')`;
	return sql<number>`((${questions.score} + 1)::float8 / power(greatest(extract(epoch from (${at} - ${questions.createdAt})) / 3600.0, 0) + 2, ${HOT_GRAVITY}::float8))`;
}

export function createListingService(db: Database) {
	// Author, Owner and Answer count of a page of Questions: two reads for the whole page.
	async function extrasFor(
		rows: Pick<Row, "id" | "authorId">[],
	): Promise<Map<string, Extras>> {
		const out = new Map<string, Extras>();
		if (rows.length === 0) {
			return out;
		}
		const authorOf = await authorsById(
			db,
			rows.map((r) => r.authorId),
		);
		const counts = await db
			.select({ questionId: answers.questionId, n: count() })
			.from(answers)
			.where(
				and(
					inArray(
						answers.questionId,
						rows.map((r) => r.id),
					),
					isNull(answers.deletedAt),
				),
			)
			.groupBy(answers.questionId);
		const countOf = new Map(counts.map((c) => [c.questionId, c.n]));
		for (const row of rows) {
			out.set(row.id, {
				answerCount: countOf.get(row.id) ?? 0,
				...(authorOf.get(row.authorId) ?? UNKNOWN_AUTHOR),
			});
		}
		return out;
	}

	function filters(
		input: Pick<ListQuestionsInput, "language" | "status"> & { q?: string },
	) {
		const words = titleWords(input.q);
		return [
			isNull(questions.deletedAt),
			words.length
				? or(...words.map((w) => ilike(questions.title, `%${w}%`)))
				: undefined,
			input.language ? eq(questions.language, input.language) : undefined,
			input.status ? eq(questions.status, input.status) : undefined,
		];
	}

	async function recent(
		input: ListQuestionsInput,
		extra: (SQL | undefined)[],
	): Promise<{ items: QuestionListItem[]; nextCursor: string | null }> {
		const position = input.cursor ? decodeCursor(input.cursor) : null;
		if (input.cursor && !position) {
			throw new InvalidCursorError();
		}
		const rows = await db
			.select({ q: questions })
			.from(questions)
			.innerJoin(user, eq(user.id, questions.authorId))
			.where(
				and(
					...filters(input),
					input.tags?.length
						? arrayOverlaps(questions.tags, input.tags)
						: undefined,
					input.country ? eq(user.country, input.country) : undefined,
					...extra,
					position
						? or(
								lt(questions.createdAt, position.createdAt),
								and(
									eq(questions.createdAt, position.createdAt),
									lt(questions.id, position.id),
								),
							)
						: undefined,
				),
			)
			.orderBy(desc(questions.createdAt), desc(questions.id))
			.limit(input.limit + 1);
		const page = rows.slice(0, input.limit).map((r) => r.q);
		const last = page.at(-1);
		const extras = await extrasFor(page);
		return {
			items: page.map((q) => toItem(q, extras.get(q.id) as Extras)),
			nextCursor:
				rows.length > input.limit && last
					? encodeCursor(last.createdAt, last.id)
					: null,
		};
	}

	async function hot(
		input: ListQuestionsInput,
		tags: string[] | undefined,
		// The For You feed also keeps the Member's own Questions, whatever their Tags.
		ownerId?: string,
	): Promise<{
		items: QuestionListItem[];
		nextCursor: string | null;
		snapshotAt: Date;
	}> {
		const position = input.cursor ? decodeHotCursor(input.cursor) : null;
		if (input.cursor && !position) {
			throw new InvalidCursorError();
		}
		const snapshotAt = position?.snapshotAt ?? new Date();
		const score = hotExpr(snapshotAt);
		const rows = await db
			.select({ q: questions, hot: score.as("hot") })
			.from(questions)
			.innerJoin(user, eq(user.id, questions.authorId))
			.where(
				and(
					...filters(input),
					lte(questions.createdAt, snapshotAt),
					tags?.length
						? ownerId
							? or(
									arrayOverlaps(questions.tags, tags),
									eq(questions.authorId, ownerId),
								)
							: arrayOverlaps(questions.tags, tags)
						: undefined,
					input.country ? eq(user.country, input.country) : undefined,
					position
						? or(
								sql`${score} < ${position.hot}::float8`,
								and(
									sql`${score} = ${position.hot}::float8`,
									lt(questions.id, position.id),
								),
							)
						: undefined,
				),
			)
			.orderBy(desc(score), desc(questions.id))
			.limit(input.limit + 1);
		const page = rows.slice(0, input.limit);
		const last = page.at(-1);
		const extras = await extrasFor(page.map((r) => r.q));
		return {
			items: page.map((r) => toItem(r.q, extras.get(r.q.id) as Extras)),
			nextCursor:
				rows.length > input.limit && last
					? encodeHotCursor({
							snapshotAt,
							hot: Number(last.hot),
							id: last.q.id,
						})
					: null,
			snapshotAt,
		};
	}

	return {
		extrasFor,

		/** `questions.list`: filters apply to every sort; `unanswered` is open Questions, newest first. */
		async list(input: ListQuestionsInput) {
			if (input.sort === "hot") {
				const { items, nextCursor } = await hot(input, input.tags);
				return { items, nextCursor };
			}
			return recent(
				input,
				input.sort === "unanswered" ? [eq(questions.status, "open")] : [],
			);
		},

		/** `feed.forYou`: hottest Questions on the Tags the Member follows (plus their own), or overall without any. */
		async forYou(
			userId: string,
			input: { cursor?: string; limit: number },
		): Promise<ForYouPage> {
			if (input.cursor && !decodeHotCursor(input.cursor)) {
				throw new InvalidCursorError();
			}
			const followed = await db
				.select({ tag: tagFollows.tag })
				.from(tagFollows)
				.where(eq(tagFollows.userId, userId));
			const tags = followed.map((f) => f.tag);
			const { items, nextCursor, snapshotAt } = await hot(
				{ ...input, sort: "hot", tags: undefined },
				tags,
				userId,
			);
			return {
				items,
				nextCursor,
				snapshotAt: snapshotAt.toISOString(),
				fallback: tags.length === 0,
			};
		},
	};
}

export type ListingService = ReturnType<typeof createListingService>;
