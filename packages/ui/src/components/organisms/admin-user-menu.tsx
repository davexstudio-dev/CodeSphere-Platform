"use client";

import { Badge } from "@codesphere/ui/components/atoms/badge";
import { InitialsAvatar } from "@codesphere/ui/components/atoms/initials-avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@codesphere/ui/components/molecules/dropdown-menu";
import { cn } from "@codesphere/ui/lib/utils";
import { ChevronsUpDownIcon } from "lucide-react";

type AdminUserMenuProps = {
	name: string;
	email?: string;
	/** The role as the person reads it: « Admin », « Super admin »... */
	roleLabel: string;
	/** Accessible name of the trigger. */
	label: string;
	/** Only the avatar: the sidebar is collapsed. */
	compact?: boolean;
	/** The entries: `AdminUserMenuItem`s, `DropdownMenuSeparator`s and any block of settings. */
	children: React.ReactNode;
	className?: string;
};

/**
 * The signed-in staff member at the bottom of the back-office sidebar (#286): an avatar with the
 * name and the role, opening the account menu. Same look as the visitor's badge in the site header.
 */
/**
 * The button of the badge: the avatar, the name and the role in a framed row, or the avatar alone
 * in a circle when the sidebar is collapsed (the hover, open state and focus ring follow the avatar).
 */
function AccountButton({
	compact,
	className,
	...props
}: React.ComponentProps<"button"> & { compact?: boolean }) {
	return (
		<button
			type="button"
			data-slot="admin-user-menu"
			className={cn(
				"flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-1.5 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-sidebar-accent",
				compact &&
					"w-auto shrink-0 justify-center self-center rounded-full border-transparent bg-transparent p-1",
				className,
			)}
			{...props}
		/>
	);
}

function AdminUserMenu({
	name,
	email,
	roleLabel,
	label,
	compact,
	children,
	className,
}: AdminUserMenuProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<AccountButton
						aria-label={label}
						title={compact ? `${name} · ${roleLabel}` : undefined}
						compact={compact}
						className={className}
					/>
				}
			>
				<InitialsAvatar name={name} ringed />
				{!compact && (
					<>
						<span className="flex min-w-0 flex-1 flex-col">
							<span className="truncate font-medium text-sm">{name}</span>
							<span className="truncate text-muted-foreground text-xs">
								{roleLabel}
							</span>
						</span>
						<ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
					</>
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" align="start" className="min-w-64">
				<DropdownMenuGroup>
					<DropdownMenuLabel>
						<span className="flex flex-col gap-1">
							<span className="font-medium text-foreground text-sm">
								{name}
							</span>
							{email && (
								<span className="truncate font-normal text-muted-foreground text-xs">
									{email}
								</span>
							)}
							<Badge variant="outline" className="mt-0.5 w-fit">
								{roleLabel}
							</Badge>
						</span>
					</DropdownMenuLabel>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				{children}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export { AdminUserMenu, type AdminUserMenuProps };
