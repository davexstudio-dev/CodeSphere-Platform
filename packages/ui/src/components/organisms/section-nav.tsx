"use client";

import { cn } from "@codesphere/ui/lib/utils";
import { useEffect, useState } from "react";

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

/**
 * The summary of a long page: a row of chips on a small screen, a sticky list on a wide one, with
 * the section being read highlighted. The links are plain anchors, so they work without JavaScript;
 * only the highlight follows the scroll.
 */
function SectionNav({ title, items, className, ...props }: SectionNavProps) {
	const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

	useEffect(() => {
		const targets = items
			.map((item) => document.getElementById(item.id))
			.filter((el): el is HTMLElement => el !== null);
		if (targets.length === 0) {
			return;
		}
		// A section is « current » while it crosses the band under the top of the viewport.
		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries
					.filter((entry) => entry.isIntersecting)
					.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
				if (visible[0]) {
					setActive(visible[0].target.id);
				}
			},
			{ rootMargin: "-10% 0px -70% 0px" },
		);
		for (const target of targets) {
			observer.observe(target);
		}
		return () => observer.disconnect();
	}, [items]);

	return (
		<nav
			data-slot="section-nav"
			aria-label={title}
			className={cn("flex flex-col gap-2", className)}
			{...props}
		>
			<p className="hidden font-medium text-[11px] text-muted-foreground uppercase tracking-widest lg:block">
				{title}
			</p>
			<ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
				{items.map((item) => {
					const current = active === item.id;
					const share = item.progress?.total
						? (item.progress.done / item.progress.total) * 100
						: 0;
					return (
						<li key={item.id} className="shrink-0">
							<a
								href={`#${item.id}`}
								aria-current={current ? "location" : undefined}
								className={cn(
									"flex flex-col gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
									"lg:rounded-md lg:border-transparent lg:bg-transparent lg:px-2.5",
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
											className="block h-full rounded-full bg-emerald-500"
											style={{ width: `${share}%` }}
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
