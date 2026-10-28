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
 * A master/detail screen opens on an entry (#291): when nothing is selected, or the selection left
 * the list (a filter, a deletion), the first entry is selected.
 */
export function useDefaultSelection(
	selectedId: string | null,
	ids: readonly string[],
	firstId: string | null,
	select: (id: string) => void,
	enabled = true,
) {
	const missing = selectedId === null || !ids.includes(selectedId);
	useEffect(() => {
		if (enabled && missing && firstId) {
			select(firstId);
		}
	}, [enabled, missing, firstId, select]);
}
