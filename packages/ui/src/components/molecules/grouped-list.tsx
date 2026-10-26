"use client";

import { Input } from "@codesphere/ui/components/atoms/input";
import { ScrollArea } from "@codesphere/ui/components/molecules/scroll-area";
import { cn } from "@codesphere/ui/lib/utils";
import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

type GroupedListItem = {
	id: string;
	/** Shown in the row and matched by the search. */
	name: string;
	/** Key of the group the row belongs to. */
	group: string;
	/** Right-hand pill: a count (« 12 ») or a status (« Suspendu »). */
	meta?: React.ReactNode;
	/** Extra text the search also matches, e.g. an email. */
	keywords?: string;
};

type GroupedListGroup = { key: string; label: string };

type GroupedListProps<T extends GroupedListItem> = {
	items: readonly T[];
	/** The groups in display order; an empty group is not shown. */
	groups: readonly GroupedListGroup[];
	selectedId?: string | null;
	onSelect: (item: T) => void;
	/** Accessible name of the list, e.g. « Membres ». */
	label: string;
	searchLabel?: string;
	searchPlaceholder?: string;
	emptyText?: string;
	/** Next to the search, e.g. the « + » that creates a Tag. */
	actions?: React.ReactNode;
	className?: string;
};

/** A row of the admin list: the name and a count or status pill; the active row is marked. */
function ListRow({
	name,
	meta,
	selected,
	onClick,
}: {
	name: string;
	meta?: React.ReactNode;
	selected?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			data-slot="list-row"
			aria-current={selected ? "true" : undefined}
			onClick={onClick}
			className={cn(
				"flex w-full items-center justify-between gap-3 border-border border-b px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
				selected &&
					"bg-accent font-medium shadow-[inset_3px_0_0_var(--primary)]",
			)}
		>
			<span className="min-w-0 truncate">{name}</span>
			{meta !== undefined && (
				<span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-muted-foreground text-xs tabular-nums">
					{meta}
				</span>
			)}
		</button>
	);
}

const collator = new Intl.Collator(undefined, { sensitivity: "base" });

/**
 * The left-hand admin list (#117, variant 3): a search, then groups under sticky headers with
 * their count, rows sorted by name. Grouping makes the rules visible (Protégés / Utilisés...).
 */
function GroupedList<T extends GroupedListItem>({
	items,
	groups,
	selectedId,
	onSelect,
	label,
	searchLabel = "Filtrer",
	searchPlaceholder = "Filtrer",
	emptyText = "Aucun résultat.",
	actions,
	className,
}: GroupedListProps<T>) {
	const [query, setQuery] = useState("");
	const sections = useMemo(() => {
		const needle = query.trim().toLocaleLowerCase();
		const matching = items.filter(
			(item) =>
				!needle ||
				`${item.name} ${item.keywords ?? ""}`
					.toLocaleLowerCase()
					.includes(needle),
		);
		return groups
			.map((group) => ({
				...group,
				items: matching
					.filter((item) => item.group === group.key)
					.sort((a, b) => collator.compare(a.name, b.name)),
			}))
			.filter((group) => group.items.length);
	}, [items, groups, query]);

	return (
		<div
			data-slot="grouped-list"
			className={cn("flex min-h-0 flex-col gap-2", className)}
		>
			<div className="flex items-center gap-2">
				<div className="relative flex-1">
					<SearchIcon
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						type="search"
						aria-label={searchLabel}
						placeholder={searchPlaceholder}
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						className="pl-8"
					/>
				</div>
				{actions}
			</div>
			<ScrollArea className="min-h-0 flex-1 rounded-md border border-border">
				<nav aria-label={label}>
					{sections.length === 0 && (
						<p className="p-3 text-muted-foreground text-sm">{emptyText}</p>
					)}
					{sections.map((section) => (
						<section key={section.key} aria-label={section.label}>
							<h3 className="sticky top-0 z-[1] flex justify-between bg-background px-3 pt-2 pb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-widest">
								{section.label}
								<span className="tabular-nums">{section.items.length}</span>
							</h3>
							{section.items.map((item) => (
								<ListRow
									key={item.id}
									name={item.name}
									meta={item.meta}
									selected={item.id === selectedId}
									onClick={() => onSelect(item)}
								/>
							))}
						</section>
					))}
				</nav>
			</ScrollArea>
		</div>
	);
}

export {
	GroupedList,
	type GroupedListGroup,
	type GroupedListItem,
	type GroupedListProps,
	ListRow,
};
