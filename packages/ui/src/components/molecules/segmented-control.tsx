"use client";

import { useSlidingPill } from "@codesphere/ui/hooks/use-sliding-pill";
import { cn } from "@codesphere/ui/lib/utils";

type SegmentedControlProps<T extends string> = Omit<
	React.ComponentProps<"div">,
	"onChange"
> & {
	options: readonly T[];
	value: T;
	onValueChange: (value: T) => void;
	/** What each option shows, when it should read differently from its value. */
	labels?: Partial<Record<T, string>>;
};

function SegmentedControl<T extends string>({
	options,
	value,
	onValueChange,
	labels,
	className,
	...props
}: SegmentedControlProps<T>) {
	const { listRef, pillRef } = useSlidingPill<HTMLDivElement>(value);
	return (
		<div
			ref={listRef}
			role="tablist"
			data-slot="segmented-control"
			className={cn(
				"relative flex gap-1 rounded-full border border-border bg-card p-1 text-sm",
				className,
			)}
			{...props}
		>
			<span
				ref={pillRef}
				aria-hidden="true"
				className="t-tabs-pill bg-primary"
			/>
			{options.map((option) => {
				const selected = option === value;
				return (
					<button
						key={option}
						type="button"
						role="tab"
						aria-selected={selected}
						onClick={() => onValueChange(option)}
						className={cn(
							"relative z-10 rounded-full px-4 py-1 transition-colors",
							selected
								? "text-primary-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{labels?.[option] ?? option}
					</button>
				);
			})}
		</div>
	);
}

export { SegmentedControl, type SegmentedControlProps };
