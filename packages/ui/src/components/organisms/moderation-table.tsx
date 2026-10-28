"use client";

import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { ReasonDialog } from "@codesphere/ui/components/molecules/reason-dialog";
import {
	type RowAction,
	RowActions,
} from "@codesphere/ui/components/molecules/row-actions";
import {
	Table,
	TableBody,
	TableCell,
	TableEmpty,
	TableHead,
	TableHeader,
	TableRow,
} from "@codesphere/ui/components/molecules/table";
import {
	TableBulkBar,
	TablePagination,
	TableSelectCell,
	TableSelectHead,
	TableSortHead,
} from "@codesphere/ui/components/molecules/table-controls";
import {
	NO_SELECTION,
	pageSelectionState,
	pruneSelection,
	type Selection,
	type SortState,
	togglePage,
	toggleRow,
} from "@codesphere/ui/components/molecules/table-state";
import { EyeIcon, ShieldAlertIcon } from "lucide-react";
import { useState } from "react";

type ModerationRow = {
	id: string;
	kind: "question" | "member";
	title: string;
	author: string;
	reportedAgo: string;
	status: "open" | "closed" | "active" | "suspended";
};

/**
 * What the admin decided: the row and the reason typed in the dialog. An object, not two
 * arguments, so a caller written for the old `(row) =>` fails to compile instead of dropping
 * the reason the dialog promised to journal.
 */
type ModerationDecision = { row: ModerationRow; reason: string };
type ModerationBulkDecision = {
	rows: readonly ModerationRow[];
	reason: string;
};

type ModerationTableProps = {
	rows: readonly ModerationRow[];
	/**
	 * Called once the admin confirms; the caller records the action, with its reason, in the
	 * audit log.
	 */
	onConfirm: (decision: ModerationDecision) => void;
	/** The same decision on every checked row; without it `onConfirm` runs once per row. */
	onBulkConfirm?: (decision: ModerationBulkDecision) => void;
	/** Adds « Voir le détail » to the row menu. */
	onView?: (row: ModerationRow) => void;
	/** Controlled sort; the caller sorts `rows`. Without it the headers are plain. */
	sort?: SortState;
	onSortChange?: (sort: SortState) => void;
	/** Controlled pagination; the caller passes the rows of `page`. */
	page?: number;
	pageCount?: number;
	pageSize?: number;
	total?: number;
	onPageChange?: (page: number) => void;
	/** Bounds the height: the body scrolls under a sticky header. */
	maxHeight?: number | string;
};

const STATUS_BADGE: Record<
	ModerationRow["status"],
	{
		label: string;
		variant: "outline" | "secondary" | "success" | "destructive";
	}
> = {
	open: { label: "Ouverte", variant: "outline" },
	closed: { label: "Fermée", variant: "secondary" },
	active: { label: "Actif", variant: "success" },
	suspended: { label: "Suspendu", variant: "destructive" },
};

const ACTION: Record<ModerationRow["kind"], { label: string; verb: string }> = {
	question: { label: "Fermer", verb: "fermer cette question" },
	member: { label: "Suspendre", verb: "suspendre ce membre" },
};

const COLUMNS = 6;

function actionable(row: ModerationRow) {
	return row.status === "open" || row.status === "active";
}

/**
 * Moderation queue: close a Question, suspend a Member. Built on the headless table bricks
 * (sort, selection, pagination, `⋯` menu); every decision asks for a reason and a
 * two-step confirmation in `ReasonDialog`.
 */
function ModerationTable({
	rows,
	onConfirm,
	onBulkConfirm,
	onView,
	sort = null,
	onSortChange,
	page,
	pageCount,
	pageSize,
	total,
	onPageChange,
	maxHeight,
}: ModerationTableProps) {
	const [selected, setSelected] = useState<Selection>(NO_SELECTION);
	const [target, setTarget] = useState<readonly ModerationRow[] | null>(null);

	const selectable = rows.filter(actionable);
	const selectableIds = selectable.map((row) => row.id);
	// A row that left the page (another page, a new sort) is never acted on.
	const checked = pruneSelection(selected, selectableIds);
	const checkedRows = selectable.filter((row) => checked.has(row.id));

	const single = target?.length === 1 ? target[0] : undefined;

	const header = (key: string, label: string) =>
		onSortChange ? (
			<TableSortHead sortKey={key} sort={sort} onSortChange={onSortChange}>
				{label}
			</TableSortHead>
		) : (
			<TableHead>{label}</TableHead>
		);

	const actionsOf = (row: ModerationRow): RowAction[] => [
		...(onView
			? [
					{
						id: "view",
						label: "Voir le détail",
						icon: <EyeIcon />,
						onSelect: () => onView(row),
					},
				]
			: []),
		{
			id: "moderate",
			label: ACTION[row.kind].label,
			icon: <ShieldAlertIcon />,
			destructive: true,
			disabled: !actionable(row),
			onSelect: () => setTarget([row]),
		},
	];

	const submit = (reason: string) => {
		const rowsToApply = target ?? [];
		if (rowsToApply.length > 1 && onBulkConfirm) {
			onBulkConfirm({ rows: rowsToApply, reason });
		} else {
			for (const row of rowsToApply) {
				onConfirm({ row, reason });
			}
		}
		setSelected(NO_SELECTION);
		setTarget(null);
	};

	return (
		<div className="flex flex-col gap-3">
			<Table maxHeight={maxHeight}>
				<TableHeader>
					<TableRow>
						<TableSelectHead
							state={pageSelectionState(checked, selectableIds)}
							disabled={selectable.length === 0}
							onToggle={() => setSelected(togglePage(checked, selectableIds))}
						/>
						{header("title", "Contenu")}
						{header("author", "Auteur")}
						{header("reported", "Signalé")}
						<TableHead>Statut</TableHead>
						<TableHead className="w-12 text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.length === 0 && (
						<TableEmpty colSpan={COLUMNS}>Aucun signalement.</TableEmpty>
					)}
					{rows.map((row) => {
						const status = STATUS_BADGE[row.status];
						return (
							<TableRow key={row.id} selected={checked.has(row.id)}>
								<TableSelectCell
									label={`Sélectionner ${row.title}`}
									checked={checked.has(row.id)}
									disabled={!actionable(row)}
									onCheckedChange={() =>
										setSelected(toggleRow(checked, row.id))
									}
								/>
								<TableCell className="max-w-xs">
									<div className="flex flex-col gap-1">
										<span className="truncate font-medium">{row.title}</span>
										<span className="text-muted-foreground text-xs">
											{row.kind === "question" ? "Question" : "Membre"}
										</span>
									</div>
								</TableCell>
								<TableCell>{row.author}</TableCell>
								<TableCell className="whitespace-nowrap">
									<span className="text-muted-foreground">
										{row.reportedAgo}
									</span>
								</TableCell>
								<TableCell>
									<Badge variant={status.variant}>{status.label}</Badge>
								</TableCell>
								<TableCell className="text-right">
									<RowActions
										label={`Actions pour ${row.title}`}
										actions={actionsOf(row)}
									/>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>

			{page !== undefined && pageCount !== undefined && onPageChange && (
				<TablePagination
					page={page}
					pageCount={pageCount}
					pageSize={pageSize}
					total={total}
					onPageChange={onPageChange}
				/>
			)}

			<TableBulkBar
				count={checkedRows.length}
				onClear={() => setSelected(NO_SELECTION)}
				actions={
					<Button
						variant="destructive"
						size="sm"
						onClick={() => setTarget(checkedRows)}
					>
						Modérer la sélection…
					</Button>
				}
			/>

			<ReasonDialog
				open={target !== null}
				onOpenChange={(open) => !open && setTarget(null)}
				title="Confirmer l'action"
				description={
					single ? (
						<>
							Vous allez {ACTION[single.kind].verb} : « {single.title} ».
							L'action est enregistrée dans le journal d'audit.
						</>
					) : (
						<>
							Vous allez modérer {target?.length ?? 0} éléments. Chaque action
							est enregistrée dans le journal d'audit avec cette raison.
						</>
					)
				}
				confirmLabel={
					single ? ACTION[single.kind].label : "Modérer la sélection"
				}
				onSubmit={submit}
			/>
		</div>
	);
}

export {
	type ModerationBulkDecision,
	type ModerationDecision,
	type ModerationRow,
	ModerationTable,
	type ModerationTableProps,
};
