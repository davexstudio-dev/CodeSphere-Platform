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
	return (
		<div
			role="tablist"
			data-slot="segmented-control"
			className={cn(
				"flex gap-1 rounded-full border border-border bg-card p-1 text-sm",
				className,
			)}
			{...props}
		>
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
							"rounded-full px-4 py-1 transition-colors",
							selected
								? "bg-primary text-primary-foreground"
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
