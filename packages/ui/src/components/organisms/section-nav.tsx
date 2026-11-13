"use client";

import { cn } from "@codesphere/ui/lib/utils";
import { useEffect, useRef, useState } from "react";

type SectionNavItem = {
	/** The id of the element the link scrolls to. */
	id: string;
	label: string;
	/** Progress of the section (« 3 / 5 »): a figure and a thin bar under the label. */
	progress?: { done: number; total: number };
};

type SectionNavProps = Omit<React.ComponentProps<"nav">, "children"> & {
	title: string;
	items: readonly SectionNavItem[];
};

// Tailwind's `lg` breakpoint: below it the summary is a row of chips, from it a vertical list.
const WIDE = "(min-width: 1024px)";
// Where a section heading lands under the sticky bars (px from the top of the viewport): the
// site bar (64) plus, below `lg` only, this component's own sticky row. A heading at or above
// this line counts as « passed ».
const LINE_NARROW = 152;
const LINE_WIDE = 120;
// Where an anchor tap leaves a heading: the `scroll-mt-*` the page gives its headings.
const LANDING_NARROW = 144;
const LANDING_WIDE = 112;

/**
 * The summary of a long page: a row of chips on a small screen, a sticky list on a wide one, with
 * the section being read highlighted. The links are plain anchors, so they work without JavaScript;
 * only the highlight follows the scroll. On a small screen the row keeps the highlighted chip in
 * view, hides the scrollbar and fades the edge where more chips wait.
 */
function SectionNav({ title, items, className, ...props }: SectionNavProps) {
	const [active, setActive] = useState<string | null>(null);
	const [fade, setFade] = useState({ start: false, end: false });
	const list = useRef<HTMLUListElement>(null);

	// The current section is the last one whose heading has gone past a line under the sticky bars;
	// at the bottom of the page it is the last one, since its heading may never get that far up.
	// Above the first heading there is none. Computed from the scroll position rather than from an
	// IntersectionObserver, which says nothing when no heading crosses its band (top, bottom, a
	// deep link, a resize).
	useEffect(() => {
		const targets = items
			.map((item) => document.getElementById(item.id))
			.filter((el): el is HTMLElement => el !== null);
		if (targets.length === 0) {
			return;
		}
		let frame = 0;
		const update = () => {
			frame = 0;
			const wide = window.matchMedia(WIDE).matches;
			const line = wide ? LINE_WIDE : LINE_NARROW;
			let current: HTMLElement | null = null;
			let nearest = Number.NEGATIVE_INFINITY;
			for (const target of targets) {
				const top = target.getBoundingClientRect().top;
				if (top <= line && top > nearest) {
					nearest = top;
					current = target;
				}
			}
			const atBottom =
				window.scrollY > 0 &&
				window.innerHeight + window.scrollY >=
					document.documentElement.scrollHeight - 2;
			// At the bottom the last section wins, unless the current heading has just been brought
			// to its landing spot by a tap on its chip: then the chip tapped stays the highlighted one.
			const landing = wide ? LANDING_WIDE : LANDING_NARROW;
			const justLanded =
				current !== null &&
				Math.abs(current.getBoundingClientRect().top - landing) <= 6;
			if (atBottom && !justLanded) {
				current = targets[targets.length - 1] ?? null;
			}
			setActive(current?.id ?? null);
		};
		const schedule = () => {
			if (frame === 0) {
				frame = requestAnimationFrame(update);
			}
		};
		update();
		window.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
		};
	}, [items]);

	// Which edges of the row still hide chips: those get a fade.
	useEffect(() => {
		const row = list.current;
		if (!row) {
			return;
		}
		const update = () => {
			const max = row.scrollWidth - row.clientWidth;
			setFade({ start: row.scrollLeft > 4, end: row.scrollLeft < max - 4 });
		};
		update();
		row.addEventListener("scroll", update, { passive: true });
		window.addEventListener("resize", update);
		return () => {
			row.removeEventListener("scroll", update);
			window.removeEventListener("resize", update);
		};
	}, []);

	// Keep the highlighted chip in view. The row is scrolled itself, never with `scrollIntoView`:
	// that would also scroll the page when the row is off screen.
	useEffect(() => {
		const row = list.current;
		const chip =
			active && row
				? row.querySelector<HTMLElement>(`a[href="#${CSS.escape(active)}"]`)
				: null;
		if (!row || row.scrollWidth <= row.clientWidth) {
			return;
		}
		const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
			.matches
			? "auto"
			: "smooth";
		if (!chip) {
			// Nothing is current (above the first section): bring the row back to its start.
			row.scrollTo({ left: 0, behavior });
			return;
		}
		const rowBox = row.getBoundingClientRect();
		const chipBox = chip.getBoundingClientRect();
		row.scrollTo({
			left:
				row.scrollLeft +
				(chipBox.left - rowBox.left) -
				(row.clientWidth - chipBox.width) / 2,
			behavior,
		});
	}, [active]);

	return (
		<nav
			data-slot="section-nav"
			aria-label={title}
			className={cn("flex flex-col gap-2", className)}
			{...props}
		>
			<p className="hidden font-medium text-2xs text-muted-foreground uppercase tracking-widest lg:block">
				{title}
			</p>
			<ul
				ref={list}
				style={
					{
						"--fade-start": fade.start ? "1.5rem" : "0px",
						"--fade-end": fade.end ? "1.5rem" : "0px",
					} as React.CSSProperties
				}
				className={cn(
					// Row of chips below `lg`: scrolls sideways, no scrollbar, chips snap, edges fade.
					"-mx-1 -my-1 flex snap-x snap-proximity gap-1.5 overflow-x-auto px-1 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
					"[mask-image:linear-gradient(to_right,transparent,#000_var(--fade-start),#000_calc(100%-var(--fade-end)),transparent)]",
					// Vertical list from `lg`.
					"lg:mx-0 lg:my-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:py-0 lg:[mask-image:none]",
				)}
			>
				{items.map((item) => {
					const current = active === item.id;
					const share = item.progress?.total
						? (item.progress.done / item.progress.total) * 100
						: 0;
					return (
						<li
							key={item.id}
							className="shrink-0 snap-start lg:snap-align-none"
						>
							<a
								href={`#${item.id}`}
								aria-current={current ? "location" : undefined}
								className={cn(
									"flex min-h-11 flex-col justify-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
									"lg:min-h-0 lg:justify-start lg:rounded-md lg:border-transparent lg:bg-transparent lg:px-2.5",
									current &&
										"border-primary/40 bg-primary/10 text-foreground lg:border-transparent lg:bg-muted",
									!current && "text-muted-foreground",
								)}
							>
								<span className="flex items-start justify-between gap-3">
									<span
										className={cn(
											"min-w-0 whitespace-nowrap lg:line-clamp-2 lg:whitespace-normal",
											current && "font-medium",
										)}
									>
										{item.label}
									</span>
									{item.progress && (
										<span className="shrink-0 whitespace-nowrap pt-0.5 text-xs tabular-nums">
											{item.progress.done} / {item.progress.total}
										</span>
									)}
								</span>
								{item.progress && (
									<span
										aria-hidden="true"
										className="hidden h-1 overflow-hidden rounded-full bg-border lg:block"
									>
										<span
											className="block h-full w-(--progress) rounded-full bg-success"
											style={
												{ "--progress": `${share}%` } as React.CSSProperties
											}
										/>
									</span>
								)}
							</a>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}

export { SectionNav, type SectionNavItem, type SectionNavProps };
