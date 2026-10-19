import type { Database } from "@codesphere/db";
import {
	watchBlockedDomains,
	watchItems,
	watchSources,
} from "@codesphere/db/schema/watch";
import { asc, eq, sql } from "drizzle-orm";

import { parseFeed } from "./feed-parser";
import { domainOf, isBlocked, normalizeUrl } from "./url";

const MAX_FEED_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 8_000;
/** Items read per Source and run: a feed lists its latest, older ones were taken before. */
const ITEMS_PER_SOURCE = 30;
/** Sources read per run, least recently read first: a run stays within a Worker's limits. */
const SOURCES_PER_RUN = 10;

export type FetchText = (url: string) => Promise<string>;

/** Reads a feed over HTTPS with a timeout and a size cap; never follows a feed to plain HTTP. */
export const fetchFeedText: FetchText = async (url) => {
	if (!url.startsWith("https://")) {
		throw new Error("feed must be served over HTTPS");
	}
	const response = await fetch(url, {
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		headers: {
			accept:
				"application/rss+xml, application/atom+xml, application/xml, text/xml",
			"user-agent": "CodeSphereBot/1.0 (+https://codesphereplatform.xyz)",
		},
	});
	if (!response.ok) {
		throw new Error(`feed answered ${response.status}`);
	}
	const reader = response.body?.getReader();
	if (!reader) {
		return "";
	}
	const decoder = new TextDecoder();
	let text = "";
	let bytes = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		bytes += value.byteLength;
		if (bytes > MAX_FEED_BYTES) {
			await reader.cancel();
			throw new Error("feed is too large");
		}
		text += decoder.decode(value, { stream: true });
	}
	return text;
};

type Source = typeof watchSources.$inferSelect;

/** Reads one Source and stores its new items, visible at once. Returns how many were new. */
export async function ingestSource(
	db: Database,
	source: Source,
	fetchText: FetchText = fetchFeedText,
	now: () => number = Date.now,
): Promise<number> {
	const blocked = (
		await db
			.select({ domain: watchBlockedDomains.domain })
			.from(watchBlockedDomains)
	).map((row) => row.domain);
	const rows: (typeof watchItems.$inferInsert)[] = [];
	let error: string | null = null;
	try {
		const parsed = parseFeed(await fetchText(source.feedUrl)).slice(
			0,
			ITEMS_PER_SOURCE,
		);
		for (const item of parsed) {
			try {
				const urlKey = normalizeUrl(item.url);
				const domain = domainOf(urlKey);
				if (isBlocked(domain, blocked)) {
					continue;
				}
				rows.push({
					url: urlKey,
					urlKey,
					domain,
					title: item.title,
					summary: item.summary,
					tags: source.tags,
					language: source.language,
					africanSource: source.african,
					sourceId: source.id,
					visibility: "visible",
					publishedAt: item.publishedAt ?? new Date(now()),
				});
			} catch {
				// A malformed link of the feed is skipped, not fatal for the others.
			}
		}
	} catch (err) {
		error = err instanceof Error ? err.message.slice(0, 200) : "unknown error";
	}
	let added = 0;
	if (rows.length > 0) {
		const inserted = await db
			.insert(watchItems)
			.values(rows)
			.onConflictDoNothing({ target: watchItems.urlKey })
			.returning({ id: watchItems.id });
		added = inserted.length;
	}
	await db
		.update(watchSources)
		.set({ lastFetchedAt: new Date(now()), lastError: error })
		.where(eq(watchSources.id, source.id));
	return added;
}

/** The scheduled task: reads the active Sources, the least recently read first. */
export async function runIngestion(
	db: Database,
	fetchText: FetchText = fetchFeedText,
	now: () => number = Date.now,
) {
	const sources = await db
		.select()
		.from(watchSources)
		.where(eq(watchSources.active, true))
		.orderBy(
			sql`${watchSources.lastFetchedAt} ASC NULLS FIRST`,
			asc(watchSources.id),
		)
		.limit(SOURCES_PER_RUN);
	let added = 0;
	for (const source of sources) {
		added += await ingestSource(db, source, fetchText, now);
	}
	return { sources: sources.length, added };
}
