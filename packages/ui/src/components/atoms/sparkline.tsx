import { cn } from "@codesphere/ui/lib/utils";

type SparklineProps = Omit<React.ComponentProps<"svg">, "children"> & {
	data: readonly number[];
};

/** Tiny trend line; the colour comes from `currentColor`. Decorative: the value is written next to it. */
function Sparkline({
	data,
	tone = "primary",
	className,
	...props
}: SparklineProps & {
	/** `destructive`: a figure that is bad when it rises (errors, response time). */
	tone?: "primary" | "destructive";
}) {
	if (data.length < 2) {
		return null;
	}
	const min = Math.min(...data);
	const max = Math.max(...data);
	const range = max - min || 1;
	const step = 100 / (data.length - 1);
	const points = data
		.map(
			(value, index) =>
				`${(index * step).toFixed(2)},${(26 - ((value - min) / range) * 24).toFixed(2)}`,
		)
		.join(" ");
	return (
		<svg
			viewBox="0 0 100 28"
			preserveAspectRatio="none"
			aria-hidden="true"
			data-slot="sparkline"
			className={cn(
				"h-7 w-full",
				tone === "destructive" ? "text-destructive" : "text-primary",
				className,
			)}
			{...props}
		>
			<polyline
				points={points}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

export { Sparkline, type SparklineProps };
