import { Badge } from "@codesphere/ui/components/atoms/badge";
import {
	type RowAction,
	RowActions,
} from "@codesphere/ui/components/molecules/row-actions";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@codesphere/ui/components/molecules/table";

type AuditEntry = {
	id: string;
	/** Already formatted, e.g. « 10 oct. 14:32 ». */
	at: string;
	actor: string;
	action: string;
	target: string;
	tone?: "default" | "warning" | "destructive";
	/** The reason typed by the admin for a decision; shown under the target. */
	reason?: string;
	/** What the menu of a row needs (#287): the raw action and the ids behind the names above. */
	actionKey?: string;
	actorId?: string | null;
	targetType?: string;
	targetId?: string | null;
	details?: {
		fields?: string[];
		reason?: string;
		from?: string;
		to?: string;
	} | null;
};

type AuditLogProps = {
	entries: readonly AuditEntry[];
	/**
	 * What a row's `⋯` menu offers. Without it the journal stays read-only and shows no Actions
	 * column, as on the pages that cannot act on an entry.
	 */
	actionsOf?: (entry: AuditEntry) => readonly RowAction[];
	/** Names a row's menu for assistive technology; French by default. */
	rowLabelOf?: (entry: AuditEntry) => string;
	/** The (visually hidden) header of the menu column; French by default. */
	actionsHeader?: string;
};

// « Options », not « Actions »: the page also has an « Action » filter, and a label that contains
// it would make that field ambiguous for a screen reader or a test looking it up by name.
const defaultRowLabel = (entry: AuditEntry) =>
	`Options de la ligne : ${entry.action} · ${entry.target}`;

const ActionBadge = ({ entry }: { entry: AuditEntry }) => (
	<Badge
		variant={
			entry.tone === "destructive"
				? "destructive"
				: entry.tone === "warning"
					? "warning"
					: "outline"
		}
	>
		{entry.action}
	</Badge>
);

// Ids and pasted URLs have no break point: let them wrap instead of widening the layout.
const Target = ({ entry }: { entry: AuditEntry }) => (
	<>
		{entry.target}
		{entry.reason && (
			<span className="mt-0.5 block text-xs">Raison : {entry.reason}</span>
		)}
	</>
);

/**
 * Read-only audit journal: keys, suspensions and account deletions (spec §4, Logs). A table when
 * the content area has room for its four columns, a stack of cards below 40 rem (a container
 * query, as for AdminMasterDetail: the sidebar takes 16 rem of a tablet's width). The table comes
 * first in the DOM so `first()` text lookups land on the visible copy on desktop.
 */
function AuditLog({
	entries,
	actionsOf,
	rowLabelOf = defaultRowLabel,
	actionsHeader = "Options",
}: AuditLogProps) {
	return (
		<div data-slot="audit-log" className="@container min-w-0">
			<div className="@max-[40rem]:hidden">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Date</TableHead>
							<TableHead>Acteur</TableHead>
							<TableHead>Action</TableHead>
							<TableHead>Cible</TableHead>
							{actionsOf && (
								<TableHead className="w-10 text-right">
									<span className="sr-only">{actionsHeader}</span>
								</TableHead>
							)}
						</TableRow>
					</TableHeader>
					<TableBody>
						{entries.map((entry) => (
							<TableRow key={entry.id}>
								<TableCell className="whitespace-nowrap font-mono text-muted-foreground text-xs">
									{entry.at}
								</TableCell>
								<TableCell>{entry.actor}</TableCell>
								<TableCell>
									<ActionBadge entry={entry} />
								</TableCell>
								<TableCell className="text-muted-foreground [overflow-wrap:anywhere]">
									<Target entry={entry} />
								</TableCell>
								{actionsOf && (
									<TableCell className="text-right">
										<RowActions
											label={rowLabelOf(entry)}
											actions={actionsOf(entry)}
										/>
									</TableCell>
								)}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
			<ul className="@min-[40rem]:hidden divide-y divide-border rounded-lg border border-border">
				{entries.map((entry) => (
					<li
						key={entry.id}
						className="flex flex-col gap-1.5 px-3 py-2.5 text-sm"
					>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<ActionBadge entry={entry} />
							<span className="flex items-center gap-1">
								<span className="font-mono text-muted-foreground text-xs">
									{entry.at}
								</span>
								{actionsOf && (
									<RowActions
										label={rowLabelOf(entry)}
										actions={actionsOf(entry)}
									/>
								)}
							</span>
						</div>
						<span className="font-medium">{entry.actor}</span>
						<span className="text-muted-foreground [overflow-wrap:anywhere]">
							<Target entry={entry} />
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}

export { type AuditEntry, AuditLog, type AuditLogProps };
