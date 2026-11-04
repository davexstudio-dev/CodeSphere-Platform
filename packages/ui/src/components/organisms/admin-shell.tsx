"use client";

import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Logo } from "@codesphere/ui/components/atoms/logo";
import {
	Collapsible,
	CollapsiblePanel,
	CollapsibleTrigger,
} from "@codesphere/ui/components/molecules/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@codesphere/ui/components/molecules/dropdown-menu";
import { ScrollArea } from "@codesphere/ui/components/molecules/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
	SheetTrigger,
} from "@codesphere/ui/components/molecules/sheet";
import { ThemeToggle } from "@codesphere/ui/components/molecules/theme-toggle";
import { cn } from "@codesphere/ui/lib/utils";
import {
	ChevronRightIcon,
	MenuIcon,
	PanelLeftCloseIcon,
	PanelLeftOpenIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

const OPEN_GROUPS_KEY = "admin-nav-open-groups";

type AdminNavItem = {
	label: string;
	href: string;
	icon: React.ComponentType<{ className?: string }>;
	active?: boolean;
	/** Heading the entry is listed under (« Pilotage », « Contenu »…); consecutive entries share it. */
	group?: string;
};

type AdminShellProps = Omit<React.ComponentProps<"div">, "title"> & {
	title: string;
	description?: string;
	nav: readonly AdminNavItem[];
	/** The router's link component (next/link). Defaults to a plain `a`. */
	LinkComponent?: React.ElementType;
	/**
	 * The signed-in member at the bottom of the sidebar: an `AdminUserMenu`. A render prop, because
	 * the menu narrows to the avatar when the sidebar collapses (and in the phone's top bar).
	 */
	userMenu?: (state: { collapsed: boolean }) => React.ReactNode;
	/** Page-level actions, rendered next to the title. */
	actions?: React.ReactNode;
	/**
	 * The icon of a group, by its `group` name, shown when the sidebar is folded to icons: one icon per
	 * group that opens its entries in a menu. Defaults to the icon of the group's first entry.
	 */
	groupIcons?: Record<string, React.ComponentType<{ className?: string }>>;
	/** Accessible name of the phone's menu button and title of its panel. */
	menuLabel?: string;
};

/** Consecutive entries with the same `group`, in their order. */
function groupsOf(nav: readonly AdminNavItem[]) {
	const groups: { name?: string; items: AdminNavItem[] }[] = [];
	for (const item of nav) {
		const last = groups.at(-1);
		if (last && last.name === item.group) {
			last.items.push(item);
		} else {
			groups.push({ name: item.group, items: [item] });
		}
	}
	return groups;
}

/**
 * Back-office layout: a sidebar on large screens; on a phone, one bar with a menu button that opens
 * the same grouped list in a sheet from the left.
 */
function AdminShell({
	title,
	description,
	nav,
	LinkComponent = "a",
	userMenu,
	actions,
	groupIcons,
	menuLabel = "Menu",
	children,
	className,
	...props
}: AdminShellProps) {
	const Link = LinkComponent;
	const [collapsed, setCollapsed] = useState(false);
	const [open, setOpen] = useState(false);
	const ToggleIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;
	const groups = groupsOf(nav);
	// The groups that are open: the one of the current screen, plus those the user opened. Every
	// screen mounts its own shell, so the choice is kept for the session.
	const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(
		() =>
			new Set(
				groups.flatMap((group) =>
					group.name && group.items.some((item) => item.active)
						? [group.name]
						: [],
				),
			),
	);
	useEffect(() => {
		try {
			const stored = JSON.parse(
				sessionStorage.getItem(OPEN_GROUPS_KEY) ?? "[]",
			) as string[];
			setOpenGroups((previous) => new Set([...previous, ...stored]));
		} catch {
			// No storage (private mode): the groups simply start folded.
		}
	}, []);
	const toggleGroup = (name: string, open: boolean) =>
		setOpenGroups((previous) => {
			const next = new Set(previous);
			if (open) {
				next.add(name);
			} else {
				next.delete(name);
			}
			try {
				sessionStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify([...next]));
			} catch {
				// Not kept: the choice only lasts for this screen.
			}
			return next;
		});

	const navList = (compact: boolean, onNavigate?: () => void) => (
		<div className="flex flex-col gap-4">
			{groups.map((group) => {
				const items = (
					<ul className="flex flex-col gap-0.5">
						{group.items.map(({ label, href, icon: Icon, active }) => (
							<li key={href}>
								<Link
									href={href}
									onClick={onNavigate}
									aria-current={active ? "page" : undefined}
									title={compact ? label : undefined}
									className={cn(
										"flex items-center gap-2.5 rounded-md px-3 py-2 font-medium text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
										compact && "justify-center px-0",
										active &&
											"bg-sidebar-accent text-sidebar-accent-foreground",
									)}
								>
									<Icon className="size-4 shrink-0" />
									<span className={cn(compact && "sr-only")}>{label}</span>
								</Link>
							</li>
						))}
					</ul>
				);
				const key = group.name ?? group.items[0]?.href;
				// Icons only: one icon per group, its entries in a menu beside it.
				if (compact && group.name) {
					const GroupIcon = groupIcons?.[group.name] ?? group.items[0]?.icon;
					const here = group.items.some((item) => item.active);
					return (
						<DropdownMenu key={key}>
							<DropdownMenuTrigger
								aria-label={group.name}
								title={group.name}
								className={cn(
									"flex w-full items-center justify-center rounded-md py-2 text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
									here && "bg-sidebar-accent text-sidebar-accent-foreground",
								)}
							>
								{GroupIcon && <GroupIcon className="size-4 shrink-0" />}
							</DropdownMenuTrigger>
							<DropdownMenuContent side="right" align="start" className="w-52">
								{group.items.map(({ label, href, icon: Icon, active }) => (
									<DropdownMenuItem
										key={href}
										render={
											<Link
												href={href}
												aria-current={active ? "page" : undefined}
											/>
										}
										className={cn(
											"gap-2.5 py-2 text-sm",
											active && "bg-accent font-medium",
										)}
									>
										<Icon className="size-4 shrink-0" />
										{label}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					);
				}
				// No heading: nothing to fold.
				if (!group.name) {
					return (
						<div key={key} className="flex flex-col gap-1">
							{items}
						</div>
					);
				}
				const name = group.name;
				return (
					<Collapsible
						key={key}
						open={openGroups.has(name)}
						onOpenChange={(open) => toggleGroup(name, open)}
						className="flex flex-col gap-1"
					>
						<CollapsibleTrigger className="group/trigger flex w-full items-center justify-between rounded-md px-3 py-1 text-2xs text-muted-foreground uppercase tracking-widest hover:text-foreground">
							{name}
							<ChevronRightIcon
								aria-hidden="true"
								className="size-3 transition-transform motion-reduce:transition-none group-data-[panel-open]/trigger:rotate-90"
							/>
						</CollapsibleTrigger>
						<CollapsiblePanel className="t-collapse">{items}</CollapsiblePanel>
					</Collapsible>
				);
			})}
		</div>
	);

	return (
		<div
			data-slot="admin-shell"
			data-collapsed={collapsed}
			className={cn(
				"min-h-svh bg-background transition-[grid-template-columns] duration-250 ease-(--ease-smooth-out) md:grid",
				collapsed ? "md:grid-cols-[4.5rem_1fr]" : "md:grid-cols-[16rem_1fr]",
				className,
			)}
			{...props}
		>
			{/* Phone: one bar. The list lives in the sheet, the account stays a tap away as the avatar. */}
			<div className="sticky top-0 z-30 flex items-center gap-2 border-border border-b bg-sidebar px-2 py-2 text-sidebar-foreground md:hidden">
				<Sheet open={open} onOpenChange={setOpen}>
					<SheetTrigger
						render={
							<Button variant="ghost" size="icon" aria-label={menuLabel} />
						}
					>
						<MenuIcon />
					</SheetTrigger>
					<SheetContent
						side="left"
						className="w-72 gap-0 bg-sidebar p-0 text-sidebar-foreground"
					>
						<div className="flex items-center gap-2 border-sidebar-border border-b p-4 pr-12">
							<Logo size="sm" className="min-w-0 whitespace-nowrap" />
							<Badge variant="outline" className="shrink-0">
								Admin
							</Badge>
						</div>
						<SheetTitle className="sr-only">{menuLabel}</SheetTitle>
						<SheetDescription className="sr-only">{title}</SheetDescription>
						<ScrollArea className="min-h-0 flex-1">
							<nav aria-label="Administration" className="p-3">
								{navList(false, () => setOpen(false))}
							</nav>
						</ScrollArea>
						{userMenu && (
							<div className="border-sidebar-border border-t p-3">
								{userMenu({ collapsed: false })}
							</div>
						)}
					</SheetContent>
				</Sheet>
				<div className="flex min-w-0 flex-1 items-center gap-2">
					<Logo size="sm" className="min-w-0 whitespace-nowrap" />
					<Badge variant="outline" className="shrink-0">
						Admin
					</Badge>
				</div>
				<ThemeToggle />
				{userMenu?.({ collapsed: true })}
			</div>

			<aside
				className={cn(
					"hidden flex-col gap-6 border-border border-r bg-sidebar p-4 text-sidebar-foreground md:sticky md:top-0 md:flex md:h-svh",
					// Collapsed (4.5 rem), the icon-only account badge is 46 px wide: 16 px of padding left only
					// 40, so it would be squeezed into a pill. 12 px leaves 48.
					collapsed && "px-3",
				)}
			>
				<div
					className={cn(
						"flex items-start justify-between gap-2",
						collapsed && "flex-col items-center",
					)}
				>
					<div className="flex min-w-0 flex-col items-start gap-1.5">
						<Logo
							compact={collapsed}
							size="sm"
							className="min-w-0 whitespace-nowrap"
						/>
						{!collapsed && (
							<Badge variant="outline" className="ml-9 w-fit">
								Admin
							</Badge>
						)}
					</div>
					<button
						type="button"
						onClick={() => setCollapsed((value) => !value)}
						aria-label={collapsed ? "Déployer le menu" : "Réduire le menu"}
						aria-expanded={!collapsed}
						className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
					>
						<ToggleIcon className="size-4" />
					</button>
				</div>
				{/* The nav takes the height left and scrolls inside it, so the account stays in view below. */}
				<nav aria-label="Administration" className="flex min-h-0 flex-1">
					<ScrollArea className="h-full min-h-0 w-full flex-1">
						<div className="pr-2.5">{navList(collapsed)}</div>
					</ScrollArea>
				</nav>
				{userMenu && (
					<div className="border-sidebar-border border-t pt-3">
						{userMenu({ collapsed })}
					</div>
				)}
			</aside>

			<div className="flex min-w-0 flex-col">
				{/* Fixed page title and subtitle (#131): the list and the record scroll under it. */}
				<header className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-3 border-border border-b bg-background/95 px-4 py-3 backdrop-blur md:top-0 md:px-8 md:py-4">
					<div className="min-w-0">
						<h1 className="truncate font-semibold text-lg tracking-tight md:text-xl">
							{title}
						</h1>
						{description && (
							<p className="line-clamp-2 text-muted-foreground text-xs md:text-sm">
								{description}
							</p>
						)}
					</div>
					<div className="flex items-center gap-2">
						{actions}
						<span className="hidden md:contents">
							<ThemeToggle />
						</span>
					</div>
				</header>
				<main className="flex flex-col gap-6 p-4 md:p-8">{children}</main>
			</div>
		</div>
	);
}

export { type AdminNavItem, AdminShell, type AdminShellProps };
