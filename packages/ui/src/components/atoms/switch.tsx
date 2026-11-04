import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@codesphere/ui/lib/utils";

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			className={cn(
				"peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 data-[disabled]:cursor-not-allowed data-[checked]:bg-primary data-[disabled]:opacity-50",
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className="t-toggle-thumb pointer-events-none block size-4 translate-x-0.5 rounded-full bg-background shadow-sm data-[checked]:translate-x-[18px]"
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch };
