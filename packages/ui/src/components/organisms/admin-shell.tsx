"use client";

import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Logo } from "@codesphere/ui/components/atoms/logo";
import { ScrollArea } from "@codesphere/ui/components/molecules/scroll-area";
import { ThemeToggle } from "@codesphere/ui/components/molecules/theme-toggle";
import { cn } from "@codesphere/ui/lib/utils";
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { useState } from "react";

type AdminNavItem = {
	label: string;
	href: string;
	icon: React.ComponentType<{ className?: string }>;
	active?: boolean;
};

type AdminShellProps = Omit<React.ComponentProps<"div">, "title"> & {
	title: string;
	description?: string;
	nav: readonly AdminNavItem[];
	/** The router's link component (next/link). Defaults to a plain `a`. */
	LinkComponent?: React.ElementType;
	/**
	 * The signed-in member at the bottom of the sidebar: an `AdminUserMenu`. A render prop, because
	 * the menu narrows to the avatar when the sidebar collapses.
	 */
	userMenu?: (state: { collapsed: boolean }) => React.ReactNode;
	/** Page-level actions, rendered next to the title. */
	actions?: React.ReactNode;
};

/** Back-office layout: a sidebar on large screens, a scrolling tab bar under the header on small ones. */
function AdminShell({
	title,
	description,
	nav,
	LinkComponent = "a",
	userMenu,
	actions,
	children,
	className,
	...props
}: AdminShellProps) {
	const Link = LinkComponent;
	const [collapsed, setCollapsed] = useState(false);
	const ToggleIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;
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
			<aside
				className={cn(
					"flex flex-col gap-3 border-border border-b bg-sidebar p-3 text-sidebar-foreground md:sticky md:top-0 md:h-svh md:gap-6 md:border-r md:border-b-0 md:p-4",
					// Collapsed (4.5 rem), the icon-only account badge is 46 px wide: 16 px of padding left only
					// 40, so it would be squeezed into a pill. 12 px leaves 48.
					collapsed && "md:px-3",
				)}
			>
				<div
					className={cn(
						"flex items-center justify-between gap-2 md:items-start",
						collapsed && "md:flex-col md:items-center",
					)}
				>
					{/* On a phone the badge sits beside the logo, so the bar is one row high. */}
					<div className="flex min-w-0 items-center gap-2 md:flex-col md:items-start md:gap-1.5">
						<Logo
							compact={collapsed}
							size="sm"
							className="min-w-0 whitespace-nowrap"
						/>
						{!collapsed && (
							<Badge variant="outline" className="w-fit shrink-0 md:ml-9">
								Admin
							</Badge>
						)}
					</div>
					<div className="flex shrink-0 items-center gap-1 md:hidden">
						<ThemeToggle />
						{userMenu?.({ collapsed: true })}
					</div>
					<button
						type="button"
						onClick={() => setCollapsed((value) => !value)}
						aria-label={collapsed ? "Déployer le menu" : "Réduire le menu"}
						aria-expanded={!collapsed}
						className="hidden size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:inline-flex"
					>
						<ToggleIcon className="size-4" />
					</button>
				</div>
				{/* The nav takes the height left and scrolls inside it, so the account stays in view below. */}
				<nav
					aria-label="Administration"
					className="-mx-1 flex min-h-0 md:mx-0 md:flex-1"
				>
					{/* The project's ScrollArea: a thin themed bar instead of the browser's, horizontal on a
					    phone (a row of tabs) and vertical in the sidebar. */}
					<ScrollArea
						orientation="both"
						className="w-full flex-1 md:h-full md:min-h-0"
					>
						<ul className="flex gap-1 px-1 pb-2 md:flex-col md:px-0 md:pr-2.5 md:pb-0">
							{nav.map(({ label, href, icon: Icon, active }) => (
								<li key={href} className="shrink-0">
									<Link
										href={href}
										aria-current={active ? "page" : undefined}
										title={collapsed ? label : undefined}
										className={cn(
											"flex items-center gap-2 rounded-md px-3 py-2 font-medium text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
											collapsed && "md:justify-center md:px-0",
											active &&
												"bg-sidebar-accent text-sidebar-accent-foreground",
										)}
									>
										<Icon className="size-4 shrink-0" />
										<span className={cn(collapsed && "md:sr-only")}>
											{label}
										</span>
									</Link>
								</li>
							))}
						</ul>
					</ScrollArea>
				</nav>
				{userMenu && (
					<div className="hidden border-sidebar-border border-t pt-3 md:block">
						{userMenu({ collapsed })}
					</div>
				)}
			</aside>

			<div className="flex min-w-0 flex-col">
				{/* Fixed page title and subtitle (#131): the list and the record scroll under it. */}
				<header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-border border-b bg-background/95 px-4 py-3 backdrop-blur md:px-8 md:py-4">
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
