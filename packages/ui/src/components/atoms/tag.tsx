import { cn } from "@codesphere/ui/lib/utils";

/** `removable`: room for the « × » button that follows the name. */
function Tag({
	className,
	removable = false,
	...props
}: React.ComponentProps<"span"> & { removable?: boolean }) {
	return (
		<span
			data-slot="tag"
			className={cn(
				"inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-foreground text-xs",
				removable && "gap-1 pr-1",
				className,
			)}
			{...props}
		/>
	);
}

export { Tag };
