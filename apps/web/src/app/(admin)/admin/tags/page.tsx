"use client";

import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Switch } from "@codesphere/ui/components/atoms/switch";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@codesphere/ui/components/molecules/alert";
import { ConfirmTwoStep } from "@codesphere/ui/components/molecules/confirm-two-step";
import { Field } from "@codesphere/ui/components/molecules/field";
import { GroupedList } from "@codesphere/ui/components/molecules/grouped-list";
import { SaveBar } from "@codesphere/ui/components/molecules/save-bar";
import { AdminMasterDetail } from "@codesphere/ui/components/organisms/admin-master-detail";
import {
	RecordFields,
	RecordSection,
	RecordSheet,
} from "@codesphere/ui/components/organisms/record-sheet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircleIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import AdminFrame from "@/components/admin-frame";
import {
	deleteBlock,
	type TagGroup,
	tagGroup,
	tagMutationErrorKey,
} from "@/lib/admin-tags";
import { firstInGroups, useDefaultSelection } from "@/lib/default-selection";
import { orpc } from "@/utils/orpc";

const GROUPS: TagGroup[] = ["protected", "used", "unused"];

type ErrorKey = ReturnType<typeof tagMutationErrorKey>;

type Mode = "read" | "edit" | "create";

export default function AdminTagsPage() {
	const t = useTranslations("admin.tags");
	const tc = useTranslations("admin.common");
	const queryClient = useQueryClient();
	const tags = useQuery(orpc.admin.tags.list.queryOptions({ input: {} }));
	const items = tags.data?.items ?? [];
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [mode, setMode] = useState<Mode>("read");
	const [name, setName] = useState("");
	const [reserveNew, setReserveNew] = useState(false);
	const [error, setError] = useState<ErrorKey | null>(null);
	const [errorOnReserve, setErrorOnReserve] = useState(false);
	const selected = items.find((tag) => tag.id === selectedId) ?? null;
	useDefaultSelection(
		selectedId,
		items.map((tag) => tag.id),
		firstInGroups(items, GROUPS, tagGroup),
		setSelectedId,
		tags.isSuccess && mode !== "create",
	);

	const settled = (nextId: string | null) => {
		setError(null);
		setMode("read");
		setSelectedId(nextId);
		void queryClient.invalidateQueries({ queryKey: orpc.admin.tags.key() });
		void queryClient.invalidateQueries({
			queryKey: orpc.admin.auditLog.key(),
		});
	};
	const report = (failure: unknown, onReserve: boolean) => {
		setError(tagMutationErrorKey(failure));
		setErrorOnReserve(onReserve);
		void queryClient.invalidateQueries({ queryKey: orpc.admin.tags.key() });
	};
	const failed = (failure: unknown) => report(failure, false);

	const create = useMutation(
		orpc.admin.tags.create.mutationOptions({
			onSuccess: (tag) => settled(tag.id),
			onError: failed,
		}),
	);
	const rename = useMutation(
		orpc.admin.tags.rename.mutationOptions({
			onSuccess: (tag) => settled(tag.id),
			onError: failed,
		}),
	);
	const reserve = useMutation(
		orpc.admin.tags.setReserved.mutationOptions({
			onSuccess: (tag) => settled(tag.id),
			onError: (failure) => report(failure, true),
		}),
	);
	const remove = useMutation(
		orpc.admin.tags.delete.mutationOptions({
			onSuccess: () => settled(null),
			onError: failed,
		}),
	);

	const block = selected ? deleteBlock(selected) : null;
	const busy =
		create.isPending ||
		rename.isPending ||
		remove.isPending ||
		reserve.isPending;

	return (
		<AdminFrame title={t("title")} description={t("description")}>
			{tags.isError && (
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertTitle>{t("unavailable")}</AlertTitle>
					<AlertDescription>
						{t(`errors.${tagMutationErrorKey(tags.error)}`)}{" "}
						<Button variant="link" size="sm" onClick={() => tags.refetch()}>
							{t("retry")}
						</Button>
					</AlertDescription>
				</Alert>
			)}
			<AdminMasterDetail
				detailKey={mode === "create" ? "create" : selected?.id}
				list={
					<GroupedList
						label={t("list")}
						searchLabel={t("search")}
						searchPlaceholder={t("searchPlaceholder")}
						emptyText={tags.isPending ? t("loading") : t("empty")}
						groups={GROUPS.map((key) => ({ key, label: t(`groups.${key}`) }))}
						selectedId={mode === "create" ? null : selectedId}
						onSelect={(tag) => {
							setSelectedId(tag.id);
							setMode("read");
							setError(null);
						}}
						actions={
							<Button
								variant="outline"
								size="icon"
								aria-label={t("create")}
								onClick={() => {
									setMode("create");
									setName("");
									setReserveNew(false);
									setError(null);
								}}
							>
								<PlusIcon />
							</Button>
						}
						items={items.map((tag) => ({
							id: tag.id,
							name: tag.name,
							group: tagGroup(tag),
							meta: tag.questionCount,
						}))}
					/>
				}
				detail={
					mode === "create" ? (
						<RecordSheet title={t("newTitle")} editing>
							<RecordSection title={t("general")}>
								<Field
									id="tag-new"
									label={t("name")}
									description={t("nameHint")}
									error={error ? t(`errors.${error}`) : undefined}
								>
									<Input
										id="tag-new"
										value={name}
										maxLength={40}
										onChange={(e) => setName(e.target.value)}
									/>
								</Field>
								<div className="flex items-center gap-2">
									<Switch
										id="tag-new-reserved"
										checked={reserveNew}
										onCheckedChange={setReserveNew}
									/>
									<label htmlFor="tag-new-reserved" className="text-sm">
										{t("reserveNew")}
									</label>
								</div>
								<p className="text-muted-foreground text-xs">
									{t("reservedHint")}
								</p>
							</RecordSection>
							<SaveBar
								dirty={name.trim().length > 0}
								saving={busy}
								onSave={() => create.mutate({ name, reserved: reserveNew })}
								onDiscard={() => setMode("read")}
								saveLabel={tc("create")}
								discardLabel={tc("cancel")}
								dirtyText={tc("dirty")}
								cleanText={tc("clean")}
							/>
						</RecordSheet>
					) : selected ? (
						<RecordSheet
							title={selected.name}
							badges={
								selected.ownerHackathon || selected.reserved ? (
									<Badge variant="outline">
										{selected.ownerHackathon ? t("protected") : t("reserved")}
									</Badge>
								) : undefined
							}
							editing={mode === "edit"}
							onEdit={
								selected.ownerHackathon || selected.reserved
									? undefined
									: () => {
											setMode("edit");
											setName(selected.name);
											setError(null);
										}
							}
						>
							<RecordSection title={t("general")}>
								{mode === "edit" ? (
									<Field
										id="tag-name"
										label={t("name")}
										error={error ? t(`errors.${error}`) : undefined}
									>
										<Input
											id="tag-name"
											value={name}
											maxLength={40}
											onChange={(e) => setName(e.target.value)}
										/>
									</Field>
								) : (
									<RecordFields
										fields={[
											{ label: t("name"), value: selected.name },
											{
												label: t("questions"),
												value: String(selected.questionCount),
											},
											{
												label: t("owner"),
												value: selected.ownerHackathon
													? t("ownerHackathon", {
															slug: selected.ownerHackathon,
														})
													: "—",
											},
										]}
									/>
								)}
							</RecordSection>
							{mode === "edit" ? (
								<SaveBar
									dirty={
										name.trim().length > 0 &&
										name.trim().toLowerCase() !== selected.name
									}
									saving={busy}
									onSave={() =>
										rename.mutate({
											id: selected.id,
											name,
											expectedVersion: selected.version,
										})
									}
									onDiscard={() => setMode("read")}
								/>
							) : (
								<>
									{!selected.ownerHackathon && (
										<RecordSection title={t("reservation")}>
											{error && errorOnReserve && (
												<Alert variant="destructive">
													<AlertCircleIcon />
													<AlertDescription>
														{t(`errors.${error}`)}
													</AlertDescription>
												</Alert>
											)}
											<div className="flex items-center gap-2">
												<Switch
													id="tag-reserved"
													checked={selected.reserved}
													disabled={busy || selected.system}
													onCheckedChange={(reserved) =>
														reserve.mutate({
															id: selected.id,
															reserved,
															expectedVersion: selected.version,
														})
													}
												/>
												<label htmlFor="tag-reserved" className="text-sm">
													{t("reserved")}
												</label>
											</div>
											<p className="text-muted-foreground text-xs">
												{selected.system ? t("systemHint") : t("reservedHint")}
											</p>
										</RecordSection>
									)}
									<RecordSection title={t("deletion")}>
										{error && !errorOnReserve && (
											<Alert variant="destructive">
												<AlertCircleIcon />
												<AlertDescription>
													{t(`errors.${error}`)}
												</AlertDescription>
											</Alert>
										)}
										{block && (
											<p className="text-muted-foreground text-sm">
												{block.reason === "owned"
													? t("blocked.owned", { slug: block.slug })
													: block.reason === "system"
														? t("blocked.system")
														: block.reason === "reserved"
															? t("blocked.reserved")
															: t("blocked.used", { count: block.count })}
											</p>
										)}
										<ConfirmTwoStep
											label={t("delete")}
											confirmLabel={(seconds) => tc("confirm", { seconds })}
											cancelLabel={tc("cancel")}
											disabled={busy || block !== null}
											onConfirm={() => remove.mutate({ id: selected.id })}
										/>
									</RecordSection>
								</>
							)}
						</RecordSheet>
					) : (
						<p className="text-muted-foreground text-sm">{t("pick")}</p>
					)
				}
			/>
		</AdminFrame>
	);
}
