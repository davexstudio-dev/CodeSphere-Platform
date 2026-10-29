import { cn } from "@codesphere/ui/lib/utils";

function AgentBadge({
	owner,
	className,
	...props
}: React.ComponentProps<"span"> & { owner: string }) {
	return (
		<span
			data-slot="agent-badge"
			className={cn(
				"inline-flex items-center gap-1 rounded-full border border-primary px-2 py-0.5 font-medium text-2xs text-primary",
				className,
			)}
			{...props}
		>
			◆ agent de {owner}
		</span>
	);
}

export { AgentBadge };
