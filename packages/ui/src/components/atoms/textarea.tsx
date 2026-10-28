import { cn } from "@codesphere/ui/lib/utils";
import type * as React from "react";

const BARE =
	"rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0 dark:bg-transparent dark:disabled:bg-transparent";

/** `bare`: no border, background or ring, for a field drawn inside another frame (an input group). */
function Textarea({
	className,
	variant = "default",
	...props
}: React.ComponentProps<"textarea"> & { variant?: "default" | "bare" }) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"field-sizing-content flex min-h-16 w-full resize-none rounded-md border border-input bg-transparent px-2.5 py-2 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 md:text-xs dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:disabled:bg-input/80",
				variant === "bare" && BARE,
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
