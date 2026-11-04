import { Sparkline } from "@codesphere/ui/components/atoms/sparkline";
import { cn } from "@codesphere/ui/lib/utils";
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";

type KpiCardProps = React.ComponentProps<"div"> & {
	label: string;
	value: string;
	/** Change versus the previous period, in percent. */
	delta?: number;
	/** For metrics where a decrease is good (unanswered questions, response time). */
	lowerIsBetter?: boolean;
	/** Context of the delta, e.g. « vs 7 jours précédents ». */
	hint?: string;
	trend?: readonly number[];
};

function KpiCard({
	label,
	value,
	delta,
	lowerIsBetter = false,
	hint,
	trend,
	className,
	...props
}: KpiCardProps) {
	const rising = (delta ?? 0) >= 0;
	const good = delta === undefined ? undefined : rising !== lowerIsBetter;
	return (
		<div
			data-slot="kpi-card"
			className={cn(
				"flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground",
				className,
			)}
			{...props}
		>
			<p className="font-medium text-muted-foreground text-xs">{label}</p>
			<p className="font-semibold text-3xl tabular-nums tracking-tight">
				{value}
			</p>
			{delta !== undefined && (
				<p
					data-trend={good ? "good" : "bad"}
					className={cn(
						"flex items-center gap-1 font-medium text-xs",
						good ? "text-success" : "text-destructive",
					)}
				>
					{rising ? (
						<TrendingUpIcon className="size-3.5" />
					) : (
						<TrendingDownIcon className="size-3.5" />
					)}
					<span>
						{rising ? "+" : ""}
						{delta.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
					</span>
					{hint && (
						<span className="font-normal text-muted-foreground">{hint}</span>
					)}
				</p>
			)}
			{trend && (
				<Sparkline
					data={trend}
					tone={good === false ? "destructive" : "primary"}
				/>
			)}
		</div>
	);
}

export { KpiCard, type KpiCardProps };
