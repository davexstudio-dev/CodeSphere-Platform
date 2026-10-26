"use client";

import { roleCan } from "@codesphere/auth/access";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@codesphere/ui/components/molecules/alert";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@codesphere/ui/components/molecules/dialog";
import { Field } from "@codesphere/ui/components/molecules/field";
import type { RowAction } from "@codesphere/ui/components/molecules/row-actions";
import {
	type AuditEntry,
	AuditLog,
} from "@codesphere/ui/components/organisms/audit-log";
import {
	RecordFields,
	RecordSection,
} from "@codesphere/ui/components/organisms/record-sheet";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
	AlertCircleIcon,
	DownloadIcon,
	ExternalLinkIcon,
	EyeIcon,
	FunnelIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import AdminFrame from "@/components/admin-frame";
import { useAdminIdentity } from "@/components/admin-identity";
import { auditEntryOf, moderationErrorKey } from "@/lib/admin-moderation";
import { auditActionMessageKey, auditTargetPath } from "@/lib/audit-target";
import { downloadCsv } from "@/lib/download";
import { client, orpc } from "@/utils/orpc";

type Filters = {
	action: string;
	actorId: string;
	targetType: string;
	targetId: string;
};
const NO_FILTERS: Filters = {
	action: "",
	actorId: "",
	targetType: "",
	targetId: "",
};

export default function AuditPage() {
	const t = useTranslations("admin.audit");
	const locale = useLocale();
	const router = useRouter();
	const identity = useAdminIdentity();
	const mayExport = roleCan(identity?.role, { audit: ["export"] });
	const [detail, setDetail] = useState<AuditEntry | null>(null);
	const [exporting, setExporting] = useState(false);
	const dateFormat = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});
	const [filters, setFilters] = useState<Filters>(NO_FILTERS);
	const set = (key: keyof Filters) => (value: string) =>
		setFilters((current) => ({ ...current, [key]: value }));

	const filterInput = {
		action: filters.action.trim() || undefined,
		actorId: filters.actorId.trim() || undefined,
		targetType: filters.targetType.trim() || undefined,
		targetId: filters.targetId.trim() || undefined,
	};
	const filtered = Object.values(filterInput).some(Boolean);

	const log = useInfiniteQuery(
		orpc.admin.auditLog.list.infiniteOptions({
			input: (cursor: string | undefined) => ({
				limit: 50,
				cursor,
				...filterInput,
			}),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (page) => page.nextCursor ?? undefined,
		}),
	);
	// Names for the ids of the journal: the Members list, when it is readable.
	const members = useQuery(
		orpc.admin.members.list.queryOptions({ input: { limit: 50 } }),
	);
	const names = useMemo(
		() =>
			new Map((members.data?.items ?? []).map((m) => [m.id, m.name] as const)),
		[members.data],
	);

	const entries = (log.data?.pages.flatMap((page) => page.items) ?? []).map(
		(event) =>
			auditEntryOf(
				event,
				(id) => names.get(id),
				(iso) => dateFormat.format(new Date(iso)),
				t("system"),
				(action) => {
					const key = auditActionMessageKey(action);
					return t.has(key) ? t(key) : action;
				},
			),
	);

	const exportCsv = async () => {
		setExporting(true);
		try {
			const out = await client.admin.auditLog.export(filterInput);
			downloadCsv(
				`audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
				out.csv,
			);
			toast.success(t("exported", { count: out.rows }));
			if (out.truncated) {
				toast.info(t("exportTruncated", { count: out.rows }));
			}
		} catch {
			toast.error(t("exportFailed"));
		} finally {
			setExporting(false);
		}
	};

	const actionsOf = (entry: AuditEntry): readonly RowAction[] => {
		const targetPath = auditTargetPath(entry.targetType, entry.targetId);
		return [
			{
				id: "detail",
				label: t("rowActions.detail"),
				icon: <EyeIcon />,
				onSelect: () => setDetail(entry),
			},
			{
				id: "by-actor",
				label: t("rowActions.byActor"),
				icon: <FunnelIcon />,
				disabled: !entry.actorId,
				onSelect: () =>
					setFilters((current) => ({
						...current,
						actorId: entry.actorId ?? "",
					})),
			},
			{
				id: "by-target",
				label: t("rowActions.byTarget"),
				icon: <FunnelIcon />,
				disabled: !entry.targetType,
				onSelect: () =>
					setFilters((current) => ({
						...current,
						targetType: entry.targetType ?? "",
						targetId: entry.targetId ?? "",
					})),
			},
			{
				id: "open-target",
				label: t("rowActions.openTarget"),
				icon: <ExternalLinkIcon />,
				disabled: !targetPath,
				onSelect: () => targetPath && router.push(targetPath),
			},
			{
				id: "export",
				label: t("rowActions.export"),
				icon: <DownloadIcon />,
				// A Moderator reads the journal but does not export it: say so rather than hide it.
				disabled: !mayExport || exporting,
				description: mayExport ? undefined : t("rowActions.exportOnly"),
				onSelect: () => void exportCsv(),
			},
		];
	};

	return (
		<AdminFrame title={t("title")} description={t("description")}>
			<form
				className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
				onSubmit={(event) => event.preventDefault()}
			>
				<Field id="audit-action" label={t("action")}>
					<Input
						id="audit-action"
						placeholder="member.suspend"
						value={filters.action}
						onChange={(e) => set("action")(e.target.value)}
					/>
				</Field>
				<Field id="audit-actor" label={t("actor")}>
					<Input
						id="audit-actor"
						value={filters.actorId}
						onChange={(e) => set("actorId")(e.target.value)}
					/>
				</Field>
				<Field id="audit-target" label={t("target")}>
					<Input
						id="audit-target"
						placeholder="member"
						value={filters.targetType}
						onChange={(e) => set("targetType")(e.target.value)}
					/>
				</Field>
				<Field id="audit-target-id" label={t("targetId")}>
					<Input
						id="audit-target-id"
						value={filters.targetId}
						onChange={(e) => set("targetId")(e.target.value)}
					/>
				</Field>
			</form>
			{filtered && (
				<Button
					variant="ghost"
					size="sm"
					className="self-start"
					onClick={() => setFilters(NO_FILTERS)}
				>
					{t("resetFilters")}
				</Button>
			)}
			{log.isError ? (
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertTitle>{t("unavailable")}</AlertTitle>
					<AlertDescription>
						{moderationErrorKey(log.error) === "forbidden"
							? t("forbidden")
							: t("error")}{" "}
						<Button variant="link" size="sm" onClick={() => log.refetch()}>
							{t("retry")}
						</Button>
					</AlertDescription>
				</Alert>
			) : log.isPending ? (
				<p className="text-muted-foreground text-sm">{t("loading")}</p>
			) : entries.length === 0 ? (
				<p className="text-muted-foreground text-sm">{t("empty")}</p>
			) : (
				<AuditLog
					entries={entries}
					actionsOf={actionsOf}
					actionsHeader={t("actionsHeader")}
					rowLabelOf={(entry) =>
						t("rowLabel", { action: entry.action, target: entry.target })
					}
				/>
			)}
			{log.hasNextPage && (
				<Button
					variant="outline"
					className="self-start"
					disabled={log.isFetchingNextPage}
					onClick={() => log.fetchNextPage()}
				>
					{t("more")}
				</Button>
			)}
			<Dialog
				open={detail !== null}
				onOpenChange={(open) => !open && setDetail(null)}
			>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>{t("detail.title")}</DialogTitle>
						<DialogDescription>{detail?.action}</DialogDescription>
					</DialogHeader>
					{detail && (
						<RecordSection title={detail.actionKey ?? detail.action}>
							<RecordFields
								fields={[
									{ label: t("detail.date"), value: detail.at },
									{ label: t("detail.actor"), value: detail.actor },
									{ label: t("detail.action"), value: detail.actionKey },
									{ label: t("detail.target"), value: detail.target },
									{
										label: t("detail.targetId"),
										value: detail.targetId ?? t("detail.none"),
									},
									{
										label: t("detail.reason"),
										value: detail.details?.reason ?? t("detail.none"),
									},
									{
										label: t("detail.fields"),
										value: detail.details?.fields?.length
											? detail.details.fields.join(", ")
											: t("detail.none"),
									},
									...(detail.details?.from || detail.details?.to
										? [
												{
													label: t("detail.role"),
													value: t("detail.roleChange", {
														from: detail.details.from ?? "—",
														to: detail.details.to ?? "—",
													}),
												},
											]
										: []),
								]}
							/>
						</RecordSection>
					)}
				</DialogContent>
			</Dialog>
		</AdminFrame>
	);
}
