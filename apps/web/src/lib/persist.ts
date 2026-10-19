import type { QueryClient } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";

import { clearLocalData, requestPersistentStorage } from "./local-store";

const STORE_KEY = "codesphere:query-cache";
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

/** Bump with the contract version so a stale cache is dropped after a breaking change. */
const BUSTER = "contract-v1";

/**
 * The reads kept for offline use (spec §3, #73), as `[root, procedure]` of the oRPC query key:
 * the feed, the Questions and Answers opened, the CADEV Hackathon, the followed Tags and the
 * profile. Anything else (an export, a Markdown preview, the admin) stays in memory only.
 */
const PERSISTED = new Set([
	"feed.forYou",
	"feed.mixed",
	"questions.list",
	"questions.get",
	"answers.list",
	"hackathons.get",
	"hackathons.list",
	"tags.followed",
	"members.me",
]);

/** Only the first pages of a feed are kept: enough to read offline, small enough to restore fast. */
export const PERSISTED_PAGES = 2;

export const PERSIST_MAX_AGE = SEVEN_DAYS;

/** Whether a query, by its oRPC key (`[["questions", "get"], …]`), is kept on the device. */
export function isPersisted(queryKey: readonly unknown[]): boolean {
	const path = queryKey[0];
	return (
		Array.isArray(path) &&
		path.length >= 2 &&
		PERSISTED.has(`${String(path[0])}.${String(path[1])}`)
	);
}

/** An infinite query keeps its first PERSISTED_PAGES pages only; anything else is kept whole. */
export function trimPages<T>(data: T): T {
	const infinite = data as { pages?: unknown[]; pageParams?: unknown[] } | null;
	if (!infinite || !Array.isArray(infinite.pages)) {
		return data;
	}
	return {
		...infinite,
		pages: infinite.pages.slice(0, PERSISTED_PAGES),
		pageParams: infinite.pageParams?.slice(0, PERSISTED_PAGES),
	} as T;
}

function trimClient(client: PersistedClient): PersistedClient {
	return {
		...client,
		clientState: {
			...client.clientState,
			queries: client.clientState.queries.map((query) => ({
				...query,
				state: { ...query.state, data: trimPages(query.state.data) },
			})),
		},
	};
}

/**
 * Persist the Query cache to IndexedDB, in the browser only. Call it once from
 * the client `Providers` with the QueryClient it created.
 */
export function setupPersistence(queryClient: QueryClient) {
	if (typeof window === "undefined" || !("indexedDB" in window)) {
		return;
	}
	void requestPersistentStorage();

	persistQueryClient({
		queryClient,
		maxAge: SEVEN_DAYS,
		buster: BUSTER,
		persister: {
			persistClient: (client) => set(STORE_KEY, trimClient(client)),
			restoreClient: () => get(STORE_KEY),
			removeClient: () => del(STORE_KEY),
		},
		dehydrateOptions: {
			shouldDehydrateQuery: (query) =>
				query.state.status === "success" && isPersisted(query.queryKey),
		},
	});
}

/** Wipe local data on logout or account switch: the in-memory cache and all of IndexedDB. */
export async function clearPersistedCache(queryClient: QueryClient) {
	queryClient.clear();
	await clearLocalData();
}
