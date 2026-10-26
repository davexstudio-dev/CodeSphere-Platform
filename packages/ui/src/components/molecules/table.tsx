import { ScrollArea } from "@codesphere/ui/components/molecules/scroll-area";
import { cn } from "@codesphere/ui/lib/utils";

type TableProps = React.ComponentProps<"table"> & {
	/**
	 * Bounds the height of the table (a CSS length or a number of px): the body then scrolls
	 * under a sticky header. Left out, the table grows with its rows, as before.
	 */
	maxHeight?: number | string;
};

function Table({ className, maxHeight, ...props }: TableProps) {
	return (
		<ScrollArea
			data-slot="table-container"
			data-scroll={maxHeight === undefined ? undefined : ""}
			orientation={maxHeight === undefined ? "horizontal" : "both"}
			style={maxHeight === undefined ? undefined : { maxHeight }}
			className={cn(
				"w-full rounded-lg border border-border",
				maxHeight !== undefined &&
					"[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-[1] [&_thead_th]:bg-muted",
			)}
		>
			<table
				data-slot="table"
				className={cn("w-full caption-bottom text-sm", className)}
				{...props}
			/>
		</ScrollArea>
	);
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
	return (
		<thead
			data-slot="table-header"
			className={cn("bg-muted/50 [&_tr]:border-b", className)}
			{...props}
		/>
	);
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
	return (
		<tbody
			data-slot="table-body"
			className={cn("[&_tr:last-child]:border-0", className)}
			{...props}
		/>
	);
}

type TableRowProps = React.ComponentProps<"tr"> & {
	/** The active or checked row: marked for sight and for assistive technology. */
	selected?: boolean;
};

function TableRow({ className, selected, ...props }: TableRowProps) {
	return (
		<tr
			data-slot="table-row"
			data-state={selected ? "selected" : undefined}
			aria-selected={selected === undefined ? undefined : selected}
			className={cn(
				"border-border border-b transition-colors hover:bg-muted/40 data-[state=selected]:bg-accent",
				className,
			)}
			{...props}
		/>
	);
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
	return (
		<th
			data-slot="table-head"
			className={cn(
				"h-9 whitespace-nowrap px-3 text-left align-middle font-medium text-muted-foreground text-xs",
				className,
			)}
			{...props}
		/>
	);
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
	return (
		<td
			data-slot="table-cell"
			className={cn("px-3 py-2.5 align-middle", className)}
			{...props}
		/>
	);
}

/** « Aucun résultat » on one row, so the header stays visible: a filter that matched nothing. */
function TableEmpty({
	colSpan,
	className,
	children,
	...props
}: Omit<React.ComponentProps<"td">, "colSpan"> & { colSpan: number }) {
	return (
		<tr data-slot="table-empty" className="border-0">
			<td
				colSpan={colSpan}
				className={cn(
					"h-24 px-3 text-center text-muted-foreground text-sm",
					className,
				)}
				{...props}
			>
				{children}
			</td>
		</tr>
	);
}

function TableCaption({
	className,
	...props
}: React.ComponentProps<"caption">) {
	return (
		<caption
			data-slot="table-caption"
			className={cn("mt-3 text-muted-foreground text-xs", className)}
			{...props}
		/>
	);
}

export {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableEmpty,
	TableHead,
	TableHeader,
	type TableProps,
	TableRow,
	type TableRowProps,
};
