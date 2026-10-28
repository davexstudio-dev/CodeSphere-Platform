import { ScrollArea } from "@codesphere/ui/components/molecules/scroll-area";
import { cn } from "@codesphere/ui/lib/utils";

type FollowedTagsProps = React.ComponentProps<"div"> & {
	label?: string;
	tags: string[];
	/** Tags highlighted as the most relevant ones. */
	highlighted?: string[];
	/** Rendered after the list, e.g. a button to follow another tag. */
	addAction?: React.ReactNode;
};

function FollowedTags({
	label = "Tes tags",
	tags,
	highlighted = [],
	addAction,
	className,
	...props
}: FollowedTagsProps) {
	return (
		<ScrollArea
			orientation="horizontal"
			data-slot="followed-tags"
			className={className}
			{...props}
		>
			<div className="flex items-center gap-2 pb-1">
				<span className="shrink-0 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
					{label}
				</span>
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
		</ScrollArea>
	);
}

export { FollowedTags, type FollowedTagsProps };
