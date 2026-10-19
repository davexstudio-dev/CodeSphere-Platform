import { cn } from "@codesphere/ui/lib/utils";
import { CheckIcon } from "lucide-react";

type StepperProps = Omit<React.ComponentProps<"ol">, "children"> & {
	steps: readonly string[];
	/** Zero-based index of the current step. */
	current: number;
};

/** Step indicator for multi-step forms such as « titre → détails → Tags et langue → relecture ». */
function Stepper({ steps, current, className, ...props }: StepperProps) {
	return (
		<ol
			data-slot="stepper"
			className={cn("flex w-full items-center gap-2", className)}
			{...props}
		>
			{steps.map((step, index) => {
				const done = index < current;
				const active = index === current;
				return (
					<li
						key={step}
						aria-current={active ? "step" : undefined}
						data-state={done ? "done" : active ? "active" : "todo"}
						className="flex min-w-0 flex-1 items-center gap-2 last:flex-none"
					>
						<span
							className={cn(
								"grid size-6 shrink-0 place-items-center rounded-full border font-semibold text-xs",
								done && "border-primary bg-primary text-primary-foreground",
								active && "border-primary text-primary",
								!done && !active && "border-border text-muted-foreground",
							)}
						>
							{done ? <CheckIcon className="size-3.5" /> : index + 1}
						</span>
						{/* On a phone only the current step is named: the others would be cut to « Dé… ».
							They stay readable by screen readers. */}
						<span
							className={cn(
								"truncate text-xs",
								active
									? "font-medium text-foreground"
									: "sr-only text-muted-foreground sm:not-sr-only",
							)}
						>
							{step}
						</span>
						{index < steps.length - 1 && (
							<span
								aria-hidden="true"
								className={cn(
									"h-px min-w-4 flex-1",
									done ? "bg-primary" : "bg-border",
								)}
							/>
						)}
					</li>
				);
			})}
		</ol>
	);
}

export { Stepper, type StepperProps };
