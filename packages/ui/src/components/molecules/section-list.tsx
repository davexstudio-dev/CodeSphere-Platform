import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from "@codesphere/ui/components/molecules/item";
import { cn } from "@codesphere/ui/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

type SectionListEntry = {
	key: string;
	label: string;
	description?: string;
	icon: React.ComponentType<{ className?: string }>;
	href: string;
};

type SectionListProps = {
	entries: readonly SectionListEntry[];
	/** The router's link component (next/link). Defaults to a plain `a`. */
	LinkComponent?: React.ElementType;
	className?: string;
};

/**
 * The sections of a settings page as a list on a phone: one row per section, with its icon, a short
 * description and a chevron. Each row is a link, so the section opens with its own address.
 */
function SectionList({
	entries,
	LinkComponent = "a",
	className,
}: SectionListProps) {
	const Link = LinkComponent;
	return (
		<ItemGroup
			data-slot="section-list"
			className={cn(
				"gap-0 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card",
				className,
			)}
		>
			{entries.map(({ key, label, description, icon: Icon, href }) => (
				<Item
					key={key}
					role="listitem"
					size="sm"
					className="rounded-none px-4 py-3.5"
					render={<Link href={href} />}
				>
					<ItemMedia
						variant="icon"
						className="size-9 rounded-lg bg-muted text-foreground [&_svg]:size-4"
					>
						<Icon />
					</ItemMedia>
					<ItemContent className="min-w-0 gap-0.5">
						<ItemTitle className="text-sm">{label}</ItemTitle>
						{description && (
							<ItemDescription className="line-clamp-1">
								{description}
							</ItemDescription>
						)}
					</ItemContent>
					<ItemActions>
						<ChevronRightIcon
							className="size-4 text-muted-foreground"
							aria-hidden="true"
						/>
					</ItemActions>
				</Item>
			))}
		</ItemGroup>
	);
}

/** The « ‹ Retour » link above an open section on a phone, back to the list. */
function SectionBack({
	href,
	label,
	LinkComponent = "a",
	className,
}: {
	href: string;
	label: string;
	LinkComponent?: React.ElementType;
	className?: string;
}) {
	const Link = LinkComponent;
	return (
		<Link
			href={href}
			className={cn(
				"-ml-1 inline-flex w-fit items-center gap-1 rounded-md px-1 py-1 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground",
				className,
			)}
		>
			<ChevronLeftIcon className="size-4" aria-hidden="true" />
			{label}
		</Link>
	);
}

export { SectionBack, SectionList, type SectionListEntry };
