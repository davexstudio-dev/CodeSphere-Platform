"use client";

import { LEGAL_DOCUMENTS, type LegalDocument } from "@codesphere/contract";
import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Textarea } from "@codesphere/ui/components/atoms/textarea";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@codesphere/ui/components/molecules/alert";
import { GroupedList } from "@codesphere/ui/components/molecules/grouped-list";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@codesphere/ui/components/molecules/tabs";
import { AdminMasterDetail } from "@codesphere/ui/components/organisms/admin-master-detail";
import {
	RecordSection,
	RecordSheet,
} from "@codesphere/ui/components/organisms/record-sheet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircleIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import AdminFrame from "@/components/admin-frame";
import { History } from "@/components/admin-legal-history";
import { PublishDialog } from "@/components/admin-legal-publish-dialog";
import {
	LANGUAGES,
	type Language,
	type Selection,
} from "@/components/admin-legal-shared";
import { MarkdownPreview } from "@/components/markdown-preview";
import { adminErrorKey } from "@/i18n/errors";
import { orpc } from "@/utils/orpc";

/** The text of the repository per document and language: the first draft of each. */
export type RepositoryTexts = Record<LegalDocument, Record<Language, string>>;

const idOf = (key: Selection) => `${key.document}:${key.language}`;

/**
 * The editor of the legal documents (#341): one text per document and language, a shared draft, a
 * publication with a reason that creates a new immutable version, and the history of the versions.
 */
export default function AdminLegalEditor({
	repository,
}: {
	repository: RepositoryTexts;
}) {
	const t = useTranslations("admin.legal");
	const overview = useQuery(orpc.admin.legal.list.queryOptions({ input: {} }));
	const [selected, setSelected] = useState<Selection>({
		document: "terms",
		language: "fr",
	});
	const items = LEGAL_DOCUMENTS.flatMap((document) =>
		LANGUAGES.map((language) => {
			const row = overview.data?.items.find(
				(item) => item.document === document && item.language === language,
			);
			return {
				id: idOf({ document, language }),
				name: t(`languages.${language}`),
				group: document,
				meta: row?.published ? `v${row.published.version}` : "—",
				document,
				language,
			};
		}),
	);
	const current = overview.data?.items.find(
		(item) =>
			item.document === selected.document &&
			item.language === selected.language,
	);

	return (
		<AdminFrame title={t("title")} description={t("description")}>
			{overview.isError && (
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertTitle>{t("unavailable")}</AlertTitle>
					<AlertDescription>
						{t(`errors.${adminErrorKey(overview.error)}`)}{" "}
						<Button
							variant="link"
							size="sm"
							onClick={() => void overview.refetch()}
						>
							{t("retry")}
						</Button>
					</AlertDescription>
				</Alert>
			)}
			<AdminMasterDetail
				detailKey={idOf(selected)}
				list={
					<GroupedList
						label={t("list")}
						searchLabel={t("list")}
						emptyText={overview.isPending ? t("loading") : t("pick")}
						groups={LEGAL_DOCUMENTS.map((key) => ({
							key,
							label: t(`documents.${key}`),
						}))}
						selectedId={idOf(selected)}
						onSelect={(item) =>
							setSelected({ document: item.document, language: item.language })
						}
						items={items}
					/>
				}
				detail={
					<DocumentPanel
						selection={selected}
						repository={repository[selected.document][selected.language]}
						published={current?.published ?? null}
					/>
				}
			/>
		</AdminFrame>
	);
}

type Published = {
	version: number;
	publishedAt: string;
	publishedByName: string | null;
	reason: string;
	important: boolean;
} | null;

function DocumentPanel({
	selection,
	repository,
	published,
}: {
	selection: Selection;
	repository: string;
	published: Published;
}) {
	const t = useTranslations("admin.legal");
	const format = useFormatter();
	const queryClient = useQueryClient();
	const { document, language } = selection;
	const [text, setText] = useState<string | null>(null);
	const [tab, setTab] = useState<"edit" | "history">("edit");
	const [publishing, setPublishing] = useState(false);

	const draft = useQuery(
		orpc.admin.legal.draft.queryOptions({ input: selection }),
	);
	const saved = draft.data?.content ?? repository;
	const value = text ?? saved;
	const dirty = value !== saved;
	const fromRepository = draft.data?.version === 0;

	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey: orpc.admin.legal.key() });
	};
	const failed = (error: unknown) => {
		toast.error(t(`errors.${adminErrorKey(error)}`));
		// Someone else saved or published first: reload what is stored, drop the local text.
		setText(null);
		refresh();
	};

	const save = useMutation(
		orpc.admin.legal.saveDraft.mutationOptions({
			onSuccess: (next) => {
				queryClient.setQueryData(
					orpc.admin.legal.draft.queryKey({ input: selection }),
					next,
				);
				setText(null);
				toast.success(t("saved"));
				refresh();
			},
			onError: failed,
		}),
	);
	const publish = useMutation(
		orpc.admin.legal.publish.mutationOptions({
			onSuccess: (version) => {
				setPublishing(false);
				toast.success(t("publishedToast", { version: version.version }));
				refresh();
			},
			onError: (error) => {
				setPublishing(false);
				failed(error);
			},
		}),
	);

	const date = (value: string) =>
		format.dateTime(new Date(value), { dateStyle: "long" });

	return (
		<RecordSheet
			title={`${t(`documents.${document}`)} · ${t(`languages.${language}`)}`}
			badges={
				published ? (
					<Badge variant="outline">
						{t("published", {
							version: published.version,
							date: date(published.publishedAt),
						})}
					</Badge>
				) : undefined
			}
		>
			<RecordSection title={t(`tabs.${tab}`)}>
				{!published && (
					<p className="text-muted-foreground text-sm">{t("notPublished")}</p>
				)}
				<Tabs
					value={tab}
					onValueChange={(next: unknown) =>
						setTab(next === "history" ? "history" : "edit")
					}
				>
					<TabsList>
						<TabsTrigger value="edit">{t("tabs.edit")}</TabsTrigger>
						<TabsTrigger value="history">{t("tabs.history")}</TabsTrigger>
					</TabsList>
					<TabsContent value="edit">
						<div className="grid gap-4">
							{fromRepository && (
								<p className="text-muted-foreground text-sm">
									{t("fromRepository")}
								</p>
							)}
							{draft.data?.updatedAt && (
								<p className="text-muted-foreground text-xs">
									{t("draftBy", {
										name: draft.data.updatedByName ?? "—",
										date: date(draft.data.updatedAt),
									})}
								</p>
							)}
							<div className="grid @min-[40rem]:grid-cols-2 gap-4">
								<div className="grid content-start gap-1.5">
									<label
										htmlFor={`${idOf(selection)}-text`}
										className="font-medium text-sm"
									>
										{t("editor.label")}
									</label>
									<Textarea
										id={`${idOf(selection)}-text`}
										mono
										className="min-h-80"
										value={value}
										maxLength={20_000}
										disabled={draft.isPending}
										onChange={(event) => setText(event.target.value)}
									/>
									<p className="text-muted-foreground text-xs">
										{t("editor.hint")}
									</p>
								</div>
								<div className="grid content-start gap-1.5">
									<span className="font-medium text-sm">
										{t("editor.preview")}
									</span>
									<div className="rounded-md border p-3">
										<MarkdownPreview body={value} />
									</div>
								</div>
							</div>
							<div className="flex flex-wrap items-center gap-3">
								<Button
									disabled={
										draft.isPending ||
										save.isPending ||
										!(dirty || fromRepository) ||
										value.trim() === ""
									}
									onClick={() =>
										save.mutate({
											document,
											language,
											content: value,
											expectedVersion: draft.data?.version ?? 0,
										})
									}
								>
									{t("saveDraft")}
								</Button>
								<Button
									variant="outline"
									disabled={
										draft.isPending ||
										dirty ||
										fromRepository ||
										publish.isPending
									}
									onClick={() => setPublishing(true)}
								>
									{t("publish")}
								</Button>
								{(dirty || fromRepository) && (
									<span className="text-muted-foreground text-xs">
										{t("needsSave")}
									</span>
								)}
							</div>
						</div>
					</TabsContent>
					<TabsContent value="history">
						<History
							selection={selection}
							onCopy={(content, version) => {
								setText(content);
								setTab("edit");
								toast.success(t("history.copied", { version }));
							}}
						/>
					</TabsContent>
				</Tabs>
			</RecordSection>
			<PublishDialog
				open={publishing}
				onOpenChange={setPublishing}
				selection={selection}
				version={draft.data?.version ?? 0}
				pending={publish.isPending}
				onSubmit={(reason, important) =>
					publish.mutate({
						document,
						language,
						expectedVersion: draft.data?.version ?? 1,
						reason,
						important,
					})
				}
			/>
		</RecordSheet>
	);
}
