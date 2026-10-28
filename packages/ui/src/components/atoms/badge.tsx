import { cn } from "@codesphere/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const badgeVariants = cva(
	"inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-medium text-2xs [&>svg]:size-3",
	{
		variants: {
			variant: {
				default: "border-transparent bg-primary text-primary-foreground",
				secondary: "border-transparent bg-secondary text-secondary-foreground",
				outline: "border-border text-foreground",
				success: "border-success/30 bg-success/10 text-success",
				warning: "border-gold/40 bg-gold/15 text-foreground",
				destructive: "border-destructive/30 bg-destructive/10 text-destructive",
			},
		},
		defaultVariants: { variant: "default" },
	},
);

type BadgeProps = React.ComponentProps<"span"> &
	VariantProps<typeof badgeVariants>;

function Badge({ variant, className, ...props }: BadgeProps) {
	return (
		<span
			data-slot="badge"
			className={cn(badgeVariants({ variant }), className)}
			{...props}
		/>
	);
}

export { Badge, type BadgeProps, badgeVariants };
