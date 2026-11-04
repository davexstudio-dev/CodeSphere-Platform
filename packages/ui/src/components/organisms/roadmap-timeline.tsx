import { cn } from "@codesphere/ui/lib/utils";
import { CheckIcon } from "lucide-react";

type RoadmapStatus = "delivered" | "in_progress" | "planned";

type RoadmapTimelineItem = {
	id: string;
	text: string;
	status: RoadmapStatus;
	/** The status as the reader reads it (« Livré »): shown in words, never by colour alone. */
	statusLabel: string;
	/** The decision or ticket behind the line (« #252 »). */
	reference?: string | null;
};

type RoadmapTimelineProps = Omit<React.ComponentProps<"ol">, "children"> & {
	items: readonly RoadmapTimelineItem[];
};

const LABEL_TONE: Record<RoadmapStatus, string> = {
	delivered: "text-success",
	in_progress: "text-gold-foreground dark:text-gold",
	planned: "text-muted-foreground",
};

// Adapted from the `onboarding-06` block of the blocks.so shadcn registry (`shadcn view
// @blocks-so/onboarding-06`): a vertical line with a marker per step. The block's Tabler icon is
// Lucide here (the project's icon library, no new dependency), the steps are the roadmap's lines,
// and the three block states (done, in progress, open) are Delivered, In progress and Planned.
/** The lines of one roadmap section as a vertical timeline, a marker for each status. */
function RoadmapTimeline({ items, className, ...props }: RoadmapTimelineProps) {
	return (
		<ol
			data-slot="roadmap-timeline"
			className={cn("flex flex-col", className)}
			{...props}
		>
			{items.map((item, index) => (
				<li
					key={item.id}
					data-status={item.status}
					className="relative flex gap-x-3 pb-5 last:pb-0"
				>
					{/* The line runs from this marker to the next; the last step stops at its marker. */}
					<div
						aria-hidden="true"
						className={cn(
							"absolute top-0 left-0 flex w-6 justify-center",
							index === items.length - 1 ? "h-6" : "-bottom-0 h-full",
						)}
					>
						<span className="w-px bg-border" />
					</div>
					<div className="relative flex size-6 flex-none items-center justify-center bg-card">
						{item.status === "delivered" ? (
							<span
								aria-hidden="true"
								className="flex size-5 items-center justify-center rounded-full bg-success/15 text-success"
							>
								<CheckIcon className="size-3.5" strokeWidth={3} />
							</span>
						) : item.status === "in_progress" ? (
							<span
								aria-hidden="true"
								className="size-3 rounded-full bg-gold ring-4 ring-gold/20"
							/>
						) : (
							<span
								aria-hidden="true"
								className="size-3 rounded-full border border-border bg-card"
							/>
						)}
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-foreground text-sm leading-6">{item.text}</p>
						<p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
							<span className={cn("font-medium", LABEL_TONE[item.status])}>
								{item.statusLabel}
							</span>
							{item.reference && (
								<span className="font-mono text-muted-foreground">
									{item.reference}
								</span>
							)}
						</p>
					</div>
				</li>
			))}
		</ol>
	);
}

export { RoadmapTimeline, type RoadmapTimelineItem, type RoadmapTimelineProps };
