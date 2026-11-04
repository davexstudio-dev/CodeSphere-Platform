import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@codesphere/ui/lib/utils";

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			className={cn("flex flex-col gap-3", className)}
			{...props}
		/>
	);
}

type TabsLayout = "inline" | "sidebar" | "grid";

const LIST_LAYOUT: Record<TabsLayout, string> = {
	inline: "",
	// A row on a phone, a column of full-width tabs from lg.
	sidebar: "lg:w-full lg:flex-col lg:items-stretch lg:rounded-2xl",
	// A grid of rounded tiles on a phone, the pill row from md.
	grid: "grid w-full rounded-2xl md:inline-flex md:w-fit md:rounded-full",
};
const TRIGGER_LAYOUT: Record<TabsLayout, string> = {
	inline: "",
	sidebar: "lg:justify-start lg:rounded-xl lg:px-3 lg:py-2",
	grid: "rounded-xl px-2 md:rounded-full md:px-4",
};

function TabsList({
	className,
	children,
	layout = "inline",
	...props
}: TabsPrimitive.List.Props & { layout?: TabsLayout }) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			className={cn(
				"relative inline-flex w-fit items-center gap-1 rounded-full border border-border bg-card p-1 text-sm",
				LIST_LAYOUT[layout],
				className,
			)}
			{...props}
		>
			{children}
			<TabsPrimitive.Indicator className="t-tabs-pill bg-primary" />
		</TabsPrimitive.List>
	);
}

function TabsTrigger({
	className,
	layout = "inline",
	...props
}: TabsPrimitive.Tab.Props & { layout?: TabsLayout }) {
	return (
		<TabsPrimitive.Tab
			data-slot="tabs-trigger"
			className={cn(
				"relative z-10 flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-[active]:text-primary-foreground",
				TRIGGER_LAYOUT[layout],
				className,
			)}
			{...props}
		/>
	);
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
	return (
		<TabsPrimitive.Panel
			data-slot="tabs-content"
			className={cn("outline-none", className)}
			{...props}
		/>
	);
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
