"use client";

import { Input } from "@codesphere/ui/components/atoms/input";
import { cn } from "@codesphere/ui/lib/utils";
import { useEffect, useMemo, useState } from "react";

type TocItem = { id: string; label: string };
type TocSection = TocItem & { items: TocItem[] };

const slug = (text: string) =>
	text
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

/**
 * The side summary of the design system: built from the page itself (every `[data-toc-section]` and
 * the `[data-toc-item]` specimens inside it), so a new Section or Specimen shows up with no edit
 * here. It gives each one an id, follows the scroll to highlight where the reader is, and filters.
 */
export function DesignSystemToc() {
	const [sections, setSections] = useState<TocSection[]>([]);
	const [active, setActive] = useState<string | null>(null);
	const [query, setQuery] = useState("");

	useEffect(() => {
		const used = new Set<string>();
		const idFor = (el: HTMLElement, label: string) => {
			if (el.id) {
				return el.id;
			}
			const base = `ds-${slug(label) || "item"}`;
			let id = base;
			for (let n = 2; used.has(id); n += 1) {
				id = `${base}-${n}`;
			}
			used.add(id);
			el.id = id;
			el.style.scrollMarginTop = "1.5rem";
			return id;
		};

		const found: TocSection[] = [];
		for (const section of document.querySelectorAll<HTMLElement>(
			"[data-toc-section]",
		)) {
			const title = section.querySelector("h2")?.textContent ?? "";
			const items: TocItem[] = [];
			for (const item of section.querySelectorAll<HTMLElement>(
				"[data-toc-item]",
			)) {
				const label = item.querySelector("span")?.textContent ?? "";
				items.push({ id: idFor(item, label), label });
			}
			found.push({ id: idFor(section, title), label: title, items });
		}
		setSections(found);

		// The reader is "in" the last heading or specimen that crossed the top fifth of the screen.
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						setActive(entry.target.id);
					}
				}
			},
			{ rootMargin: "-10% 0px -80% 0px" },
		);
		for (const section of found) {
			for (const { id } of [section, ...section.items]) {
				const el = document.getElementById(id);
				if (el) {
					observer.observe(el);
				}
			}
		}
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (active) {
			document
				.querySelector(`[data-toc-link="${active}"]`)
				?.scrollIntoView({ block: "nearest" });
		}
	}, [active]);

	const needle = query.trim().toLowerCase();
	const visible = useMemo(
		() =>
			sections
				.map((section) => ({
					...section,
					items: section.items.filter(
						(item) =>
							!needle ||
							item.label.toLowerCase().includes(needle) ||
							section.label.toLowerCase().includes(needle),
					),
				}))
				.filter((section) => !needle || section.items.length > 0),
		[sections, needle],
	);

	return (
		<aside
			aria-label="Sommaire du système de design"
			className="sticky top-0 hidden h-svh w-72 shrink-0 flex-col gap-3 border-r bg-background/80 p-4 backdrop-blur lg:flex"
		>
			<Input
				type="search"
				aria-label="Filtrer le sommaire"
				placeholder="Filtrer les composants"
				value={query}
				onChange={(event) => setQuery(event.target.value)}
			/>
			<nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 text-sm">
				{visible.map((section) => (
					<div key={section.id} className="flex flex-col gap-0.5">
						<a
							href={`#${section.id}`}
							data-toc-link={section.id}
							className={cn(
								"rounded-md px-2 py-1 font-semibold hover:bg-accent",
								active === section.id && "text-primary",
							)}
						>
							{section.label}
						</a>
						{section.items.map((item) => (
							<a
								key={item.id}
								href={`#${item.id}`}
								data-toc-link={item.id}
								aria-current={active === item.id ? "location" : undefined}
								className={cn(
									"truncate rounded-md border-transparent border-l-2 px-2 py-1 pl-4 text-muted-foreground hover:bg-accent hover:text-foreground",
									active === item.id &&
										"border-primary bg-accent text-foreground",
								)}
							>
								{item.label}
							</a>
						))}
					</div>
				))}
				{visible.length === 0 && (
					<p className="px-2 text-muted-foreground text-xs">
						Aucun composant ne correspond.
					</p>
				)}
			</nav>
		</aside>
	);
}
