"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Tabs sliding (transitions.dev 16) for a hand-made tab list: measures the selected tab
 * (`aria-selected="true"`) and writes its box on the pill as --pill-x / --pill-y / --pill-w /
 * --pill-h, which `.t-tabs-pill` tweens. The first placement and any resize snap into position
 * without a transition. Give the list `relative` and the pill `className="t-tabs-pill"`.
 */
function useSlidingPill<L extends HTMLElement>(activeKey: unknown) {
	const listRef = useRef<L>(null);
	const pillRef = useRef<HTMLSpanElement>(null);
	const placedOnce = useRef(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: activeKey is the trigger.
	useLayoutEffect(() => {
		const list = listRef.current;
		const pill = pillRef.current;
		if (!list || !pill) {
			return;
		}
		const place = (animate: boolean) => {
			const tab = list.querySelector<HTMLElement>('[aria-selected="true"]');
			if (!tab) {
				return;
			}
			if (!animate) {
				pill.style.transition = "none";
			}
			pill.style.setProperty("--pill-x", `${tab.offsetLeft}px`);
			pill.style.setProperty("--pill-y", `${tab.offsetTop}px`);
			pill.style.setProperty("--pill-w", `${tab.offsetWidth}px`);
			pill.style.setProperty("--pill-h", `${tab.offsetHeight}px`);
			if (!animate) {
				void pill.offsetWidth;
				pill.style.transition = "";
			}
		};
		place(placedOnce.current);
		placedOnce.current = true;

		// An observer reports once when it starts: that report must not cancel the slide above.
		let reported = false;
		const observer = new ResizeObserver(() => {
			if (reported) {
				place(false);
			}
			reported = true;
		});
		observer.observe(list);
		return () => observer.disconnect();
	}, [activeKey]);

	return { listRef, pillRef };
}

export { useSlidingPill };
