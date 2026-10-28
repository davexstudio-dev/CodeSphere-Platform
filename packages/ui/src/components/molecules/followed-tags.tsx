import { ScrollArea } from "@codesphere/ui/components/molecules/scroll-area";
import { cn } from "@codesphere/ui/lib/utils";

type FollowedTagsProps = React.ComponentProps<"div"> & {
	label?: string;
	tags: string[];
	/** Tags highlighted as the most relevant ones. */
	highlighted?: string[];
	/** Rendered after the list, e.g. a button to follow another tag. */
	addAction?: React.ReactNode;
	/** The Tags wrap onto several lines (a card); otherwise one row that scrolls sideways. */
	wrap?: boolean;
};

function FollowedTags({
	label = "Tes tags",
	tags,
	highlighted = [],
	addAction,
	wrap,
	className,
	...props
}: FollowedTagsProps) {
	const row = (
		<div
			className={cn(
				"flex items-center gap-2",
				wrap ? "flex-wrap" : "pb-3",
				wrap && className,
			)}
			{...(wrap ? { "data-slot": "followed-tags", ...props } : {})}
		>
			{label && (
				<span className="shrink-0 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
					{label}
				</span>
			)}
			{tags.map((tag) => {
				const isHighlighted = highlighted.includes(tag);
				return (
					<span
						key={tag}
						className={cn(
							"shrink-0 rounded-full border px-3 py-1 text-sm",
							isHighlighted
								? "border-primary bg-muted font-medium"
								: "border-border text-muted-foreground",
						)}
					>
						# {tag}
					</span>
				);
			})}
			{addAction}
		</div>
	);
	if (wrap) {
		return row;
	}
	// One row: the project's ScrollArea, its bar under the pills (pb-3) rather than over them.
	return (
		<ScrollArea
			orientation="horizontal"
			data-slot="followed-tags"
			className={cn("w-full min-w-0", className)}
			{...props}
		>
			{row}
		</ScrollArea>
	);
}

export { FollowedTags, type FollowedTagsProps };
