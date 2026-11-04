import { Button } from "@codesphere/ui/components/atoms/button";
import { cn } from "@codesphere/ui/lib/utils";
import { PencilIcon } from "lucide-react";

type RecordSheetProps = Omit<React.ComponentProps<"article">, "title"> & {
	title: React.ReactNode;
	/** Status badges next to the title. */
	badges?: React.ReactNode;
	/** Shows « Modifier » in read mode; leave it out for a record that is never edited. */
	onEdit?: () => void;
	editing?: boolean;
	editLabel?: string;
};

/**
 * The right-hand admin record (#117): a header with title, badges and « Modifier », then its
 * sections, read first (`RecordFields`) and edited on demand.
 */
function RecordSheet({
	title,
	badges,
	onEdit,
	editing,
	editLabel = "Modifier",
	children,
	className,
	...props
}: RecordSheetProps) {
	return (
		<article
			data-slot="record-sheet"
			data-mode={editing ? "edit" : "read"}
			className={cn("flex min-w-0 flex-col gap-4", className)}
			{...props}
		>
			<header className="flex flex-wrap items-center gap-2">
				<h2 className="min-w-0 truncate font-semibold text-lg">{title}</h2>
				{badges}
				<span className="flex-1" />
				{onEdit && !editing && (
					<Button variant="outline" size="sm" onClick={onEdit}>
						<PencilIcon />
						{editLabel}
					</Button>
				)}
			</header>
			{children}
		</article>
	);
}

/** A card of the record, under a small uppercase heading. */
function RecordSection({
	title,
	children,
	className,
	...props
}: Omit<React.ComponentProps<"section">, "title"> & { title: string }) {
	return (
		<section
			data-slot="record-section"
			className={cn(
				"flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground",
				className,
			)}
			{...props}
		>
			<h3 className="font-medium text-2xs text-muted-foreground uppercase tracking-widest">
				{title}
			</h3>
			{children}
		</section>
	);
}

/** The read mode of a section: a definition list of labels and values. */
function RecordFields({
	fields,
	className,
}: {
	fields: readonly { label: string; value: React.ReactNode }[];
	className?: string;
}) {
	return (
		<dl
			className={cn(
				"grid grid-cols-[minmax(6rem,9rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm",
				className,
			)}
		>
			{fields.map(({ label, value }) => (
				<div key={label} className="contents">
					<dt className="text-muted-foreground text-xs leading-5">{label}</dt>
					<dd className="min-w-0 break-words">{value}</dd>
				</div>
			))}
		</dl>
	);
}

export { RecordFields, RecordSection, RecordSheet, type RecordSheetProps };
