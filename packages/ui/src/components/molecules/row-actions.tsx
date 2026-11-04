"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@codesphere/ui/components/molecules/dropdown-menu";
import { MoreHorizontalIcon } from "lucide-react";

type RowAction = {
	id: string;
	label: string;
	icon?: React.ReactNode;
	/**
	 * A destructive action. It never runs the change itself: `onSelect` opens the reason dialog
	 * (`ReasonDialog`), so a menu click cannot suspend or delete anything.
	 */
	destructive?: boolean;
	disabled?: boolean;
	/**
	 * A line under the label, read by assistive technology with it. Use it to say why an action is
	 * greyed out (« Réservé aux Admins »): a disabled menu item cannot show a tooltip.
	 */
	description?: string;
	onSelect: () => void;
};

type RowActionsProps = {
	/** Names the row for assistive technology: « Actions pour Awa K. ». */
	label: string;
	actions: readonly RowAction[];
	className?: string;
};

const ActionText = ({ action }: { action: RowAction }) =>
	action.description ? (
		<span className="flex flex-col">
			{action.label}
			<span className="font-normal text-muted-foreground text-xs">
				{action.description}
			</span>
		</span>
	) : (
		action.label
	);

/** The `⋯` menu at the end of a row; destructive entries come last, after a separator. */
function RowActions({ label, actions, className }: RowActionsProps) {
	const safe = actions.filter((action) => !action.destructive);
	const destructive = actions.filter((action) => action.destructive);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={label}
						className={className}
					/>
				}
			>
				<MoreHorizontalIcon />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-auto min-w-44">
				{safe.map((action) => (
					<DropdownMenuItem
						key={action.id}
						disabled={action.disabled}
						onClick={action.onSelect}
					>
						{action.icon}
						<ActionText action={action} />
					</DropdownMenuItem>
				))}
				{safe.length > 0 && destructive.length > 0 && <DropdownMenuSeparator />}
				{destructive.map((action) => (
					<DropdownMenuItem
						key={action.id}
						variant="destructive"
						disabled={action.disabled}
						onClick={action.onSelect}
					>
						{action.icon}
						<ActionText action={action} />
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export { type RowAction, RowActions, type RowActionsProps };
