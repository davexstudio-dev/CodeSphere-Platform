import { useEffect } from "react";

/**
 * The first entry of a grouped list, read in the order of its groups: the one the list shows on top.
 */
export function firstInGroups<T extends { id: string }, G extends string>(
	items: readonly T[],
	groups: readonly G[],
	groupOf: (item: T) => G,
): string | null {
	for (const group of groups) {
		const first = items.find((item) => groupOf(item) === group);
		if (first) {
			return first.id;
		}
	}
	return null;
}

/**
 * A master/detail screen opens on an entry (#291): while nothing is selected, the first entry is.
 * A screen that drops its selection (a deletion, a filter) sets it to null and lands on the first
 * entry again. Only null counts: an id missing from the list may be one just created, before the
 * list is fetched again.
 */
export function useDefaultSelection(
	selectedId: string | null,
	firstId: string | null,
	select: (id: string) => void,
	enabled = true,
) {
	useEffect(() => {
		if (enabled && selectedId === null && firstId) {
			select(firstId);
		}
	}, [enabled, selectedId, firstId, select]);
}
