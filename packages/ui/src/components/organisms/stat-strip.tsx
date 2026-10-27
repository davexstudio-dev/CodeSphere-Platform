import { cn } from "@codesphere/ui/lib/utils";

type StatStripItem = {
	label: string;
	value: string;
	/** A line under the value (a period, a precision). */
	hint?: string;
};

type StatStripProps = Omit<React.ComponentProps<"dl">, "children"> & {
	items: readonly StatStripItem[];
};

// Adapted from the `stats-02` block of the blocks.so shadcn registry (`shadcn view @blocks-so/stats-02`):
// a strip of figures separated by hairlines. Not installed with `shadcn add`, which would have copied
// a second Badge and Card next to ours; the trend badge is left out, since the figures here have no
// previous value to compare with. Semantic `dl`, so it reads the same without CSS or JavaScript.
/**
 * A strip of key figures: a label, a large value, one cell each, hairlines between them (the grid's
 * gap shows the border colour behind the cells). Three columns on a wide screen, two on a tablet and
 * one on a phone: give it a multiple of six so no row is left half empty.
 */
function StatStrip({ items, className, ...props }: StatStripProps) {
	return (
		<dl
			data-slot="stat-strip"
			className={cn(
				"grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3",
				className,
			)}
			{...props}
		>
			{items.map((item) => (
				<div
					key={item.label}
					className="flex flex-col gap-1 bg-card p-4 sm:p-5"
				>
					<dt className="text-muted-foreground text-xs leading-snug">
						{item.label}
					</dt>
					<dd className="font-semibold text-3xl text-foreground tabular-nums tracking-tight">
						{item.value}
					</dd>
					{item.hint && (
						<dd className="text-muted-foreground text-xs">{item.hint}</dd>
					)}
				</div>
			))}
		</dl>
	);
}

export { StatStrip, type StatStripItem, type StatStripProps };
