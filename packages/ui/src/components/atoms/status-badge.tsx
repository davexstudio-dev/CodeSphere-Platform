import { cn } from "@codesphere/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const statusBadgeVariants = cva(
	"inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-medium text-2xs",
	{
		variants: {
			status: {
				accepted: "border-success/30 bg-success/10 text-success",
				pending: "border-gold/40 bg-gold/15 text-foreground",
				rejected: "border-destructive/30 bg-destructive/10 text-destructive",
				draft: "border-border bg-muted text-muted-foreground",
			},
		},
		defaultVariants: { status: "draft" },
	},
);

const STATUS_LABEL = {
	accepted: "Acceptée",
	pending: "En attente d'envoi",
	rejected: "Rejetée",
	draft: "Brouillon",
} as const;

type StatusBadgeProps = React.ComponentProps<"span"> &
	VariantProps<typeof statusBadgeVariants>;

function StatusBadge({
	status = "draft",
	className,
	children,
	...props
}: StatusBadgeProps) {
	const key = status ?? "draft";
	return (
		<span
			data-slot="status-badge"
			data-status={key}
			className={cn(statusBadgeVariants({ status: key }), className)}
			{...props}
		>
			{children ?? STATUS_LABEL[key]}
		</span>
	);
}

export { StatusBadge, type StatusBadgeProps, statusBadgeVariants };
