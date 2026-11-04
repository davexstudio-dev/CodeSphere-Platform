import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@codesphere/ui/lib/utils";
import type * as React from "react";

/**
 * `bare`: no border, background or ring, for a field drawn inside another frame (an input group).
 */
const BARE =
	"rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0 dark:bg-transparent dark:disabled:bg-transparent";

function Input({
	className,
	type,
	variant = "default",
	mono = false,
	textSize = "xs",
	inset,
	...props
}: React.ComponentProps<"input"> & {
	variant?: "default" | "bare";
	/** Code, a key, a link to copy. */
	mono?: boolean;
	/** `sm`: a field that stands alone on a form, at the body size. */
	textSize?: "xs" | "sm";
	/** `icon`: room on the left for an icon drawn over the field. */
	inset?: "icon";
}) {
	return (
		<InputPrimitive
			type={type}
			data-slot="input"
			className={cn(
				"h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-xs outline-none transition-colors file:inline-flex file:h-6 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 md:text-xs dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:disabled:bg-input/80",
				variant === "bare" && BARE,
				mono && "font-mono",
				textSize === "sm" && "text-sm md:text-sm",
				inset === "icon" && "pl-8",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
