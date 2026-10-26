"use client";

// From the shadcn registry (`shadcn add scroll-area`, base-lyra), with two changes: `orientation`
// on ScrollArea picks which bars it shows (the registry version only has the vertical one, and a
// ScrollBar given as a child would land inside the viewport), and the thumb is rounded.
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { cn } from "@codesphere/ui/lib/utils";

type ScrollAreaProps = ScrollAreaPrimitive.Root.Props & {
	/** Which scrollbars to show; the content scrolls along the same axes. */
	orientation?: "vertical" | "horizontal" | "both";
};

function ScrollArea({
	className,
	children,
	orientation = "vertical",
	...props
}: ScrollAreaProps) {
	return (
		<ScrollAreaPrimitive.Root
			data-slot="scroll-area"
			className={cn("relative", className)}
			{...props}
		>
			<ScrollAreaPrimitive.Viewport
				data-slot="scroll-area-viewport"
				className="size-full rounded-[inherit] outline-none transition-[color,box-shadow] focus-visible:outline-1 focus-visible:ring-[3px] focus-visible:ring-ring/50"
			>
				{children}
			</ScrollAreaPrimitive.Viewport>
			{orientation !== "horizontal" && <ScrollBar />}
			{orientation !== "vertical" && <ScrollBar orientation="horizontal" />}
			<ScrollAreaPrimitive.Corner />
		</ScrollAreaPrimitive.Root>
	);
}

function ScrollBar({
	className,
	orientation = "vertical",
	...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
	return (
		<ScrollAreaPrimitive.Scrollbar
			data-slot="scroll-area-scrollbar"
			data-orientation={orientation}
			orientation={orientation}
			className={cn(
				"flex touch-none select-none p-px transition-colors data-horizontal:h-2.5 data-vertical:h-full data-vertical:w-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:border-l data-vertical:border-l-transparent",
				className,
			)}
			{...props}
		>
			<ScrollAreaPrimitive.Thumb
				data-slot="scroll-area-thumb"
				className="relative flex-1 rounded-full bg-border hover:bg-muted-foreground/40"
			/>
		</ScrollAreaPrimitive.Scrollbar>
	);
}

export { ScrollArea, type ScrollAreaProps, ScrollBar };
