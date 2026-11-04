import type { Database } from "@codesphere/db";
import {
	watchBlockedDomains,
	watchItems,
	watchSources,
} from "@codesphere/db/schema/watch";
import { asc, eq, sql } from "drizzle-orm";

import { parseFeed } from "./feed-parser";
import { domainOf, isBlocked, isPublicHost, normalizeUrl } from "./url";

/** An address a feed may be read from: HTTPS on a public host. */
export function isSafeFeedUrl(raw: string): boolean {
	try {
		const url = new URL(raw);
		return (
			url.protocol === "https:" && isPublicHost(url.hostname.toLowerCase())
		);
	} catch {
		return false;
	}
}

const MAX_FEED_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 8_000;
/** Items read per Source and run: a feed lists its latest, older ones were taken before. */
const ITEMS_PER_SOURCE = 30;
/** Sources read per run, least recently read first: a run stays within a Worker's limits. */
const SOURCES_PER_RUN = 10;

export type FetchText = (url: string) => Promise<string>;

/** Reads a feed over HTTPS with a timeout and a size cap; never follows a feed to plain HTTP. */
export const fetchFeedText: FetchText = async (url) => {
	let current = url;
	let response: Response | undefined;
	// Redirects are followed by hand, up to three, and only to public HTTPS hosts.
	for (let hop = 0; hop <= 3; hop++) {
		if (!isSafeFeedUrl(current)) {
			throw new Error("feed must be a public HTTPS address");
		}
		response = await fetch(current, {
			redirect: "manual",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: {
				accept:
					"application/rss+xml, application/atom+xml, application/xml, text/xml",
				"user-agent": "CodeSphereBot/1.0 (+https://codesphereplatform.xyz)",
			},
		});
		const location = response.headers.get("location");
		if (response.status >= 300 && response.status < 400 && location) {
			current = new URL(location, current).toString();
			continue;
		}
		break;
	}
	if (!response?.ok) {
		throw new Error(`feed answered ${response?.status ?? "nothing"}`);
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
	return text + decoder.decode();
};

type Source = typeof watchSources.$inferSelect;

/** Reads one Source and stores its new items, visible at once. Returns how many were new. */
export async function ingestSource(
	db: Database,
	source: Source,
	fetchText: FetchText = fetchFeedText,
	now: () => number = Date.now,
	blockedDomains?: readonly string[],
): Promise<number> {
	const blocked = blockedDomains ?? (await loadBlocked(db));
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
					// A date in the future would pin the item on top of the feed: clamp it to now.
					publishedAt: new Date(
						Math.min(item.publishedAt?.getTime() ?? now(), now()),
					),
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

const loadBlocked = async (db: Database) =>
	(
		await db
			.select({ domain: watchBlockedDomains.domain })
			.from(watchBlockedDomains)
	).map((row) => row.domain);

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
	const blocked = await loadBlocked(db);
	// Read in parallel: a few slow feeds must not add up inside one Cron run.
	const counts = await Promise.all(
		sources.map((source) => ingestSource(db, source, fetchText, now, blocked)),
	);
	const added = counts.reduce((sum, n) => sum + n, 0);
	return { sources: sources.length, added };
}
