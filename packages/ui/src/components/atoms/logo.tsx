import { cn } from "@codesphere/ui/lib/utils";

function Logo({
	className,
	compact,
	size = "md",
	inverted = false,
	...props
}: React.ComponentProps<"span"> & {
	compact?: boolean;
	size?: "sm" | "md" | "lg";
	/** The round mark in the page's colours reversed, for a primary panel. */
	inverted?: boolean;
}) {
	return (
		<span
			data-slot="logo"
			className={cn(
				"inline-flex shrink-0 items-center gap-2 font-semibold tracking-tight",
				size === "sm" && "text-sm",
				size === "lg" && "text-lg",
				className,
			)}
			{...props}
		>
			<span
				className={cn(
					"grid size-7 shrink-0 place-items-center rounded-full text-sm",
					inverted
						? "bg-primary-foreground text-primary"
						: "bg-primary text-primary-foreground",
				)}
			>
				◍
			</span>
			<span
				data-slot="logo-text"
				className={compact ? "sr-only" : "whitespace-nowrap"}
			>
				CodeSphere Platform
			</span>
		</span>
	);
}

export { Logo };
