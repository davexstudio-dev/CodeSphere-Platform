"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Textarea } from "@codesphere/ui/components/atoms/textarea";
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
import { AlertCircleIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import AdminFrame from "@/components/admin-frame";
import {
	criteriaTotal,
	fromLocalInput,
	isDirty,
	toLocalInput,
} from "@/lib/admin-hackathon";
import { orpc } from "@/utils/orpc";

const SLUG = "cadev-2026";

type Draft = {
	name: string;
	/** Slug of the validated Organization that lists it (#257). */
	organizationSlug: string;
	summary: string;
	teamMin: number;
	teamMax: number;
	sourceNote: string;
	milestones: {
		key: string;
		label: string;
		startsAt: string;
		endsAt: string;
	}[];
	criteria: {
		label: string;
		weight: number;
		scoredBy: "jury" | "public" | "peers";
	}[];
};

export default function AdminHackathonsPage() {
	const t = useTranslations("admin.hackathons");
	const tc = useTranslations("admin.common");
	const locale = useLocale();
	const dateFormat = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});
	const queryClient = useQueryClient();
	const query = useQuery(
		orpc.hackathons.get.queryOptions({ input: { slug: SLUG } }),
	);
	const hackathon = query.data;
	// Only validated Organizations can list a Hackathon (#257).
	const organizations = useQuery(
		orpc.organizations.list.queryOptions({ input: { limit: 50 } }),
	);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [confirming, setConfirming] = useState(false);
	const [conflictVersion, setConflictVersion] = useState<number | null>(null);
	const [failure, setFailure] = useState<"forbidden" | "failed" | null>(null);

	const original: Draft | null = hackathon
		? {
				name: hackathon.name,
				organizationSlug: hackathon.organizationSlug ?? "",
				summary: hackathon.summary,
				teamMin: hackathon.teamMin,
				teamMax: hackathon.teamMax,
				sourceNote: hackathon.sourceNote ?? "",
				milestones: hackathon.milestones.map((m) => ({
					key: m.key,
					label: m.label,
					startsAt: toLocalInput(m.startsAt),
					endsAt: toLocalInput(m.endsAt),
				})),
				criteria: hackathon.criteria.map((c) => ({
					label: c.label,
					weight: c.weight,
					scoredBy: c.scoredBy,
				})),
			}
		: null;

	const save = useMutation(
		orpc.admin.hackathons.update.mutationOptions({
			onSuccess: (updated) => {
				queryClient.setQueryData(
					orpc.hackathons.get.queryKey({ input: { slug: SLUG } }),
					updated,
				);
				void queryClient.invalidateQueries({
					queryKey: orpc.admin.auditLog.key(),
				});
				setDraft(null);
				setConfirming(false);
				setConflictVersion(null);
				setFailure(null);
			},
			onError: (error) => {
				setConfirming(false);
				const code =
					typeof error === "object" && error !== null && "code" in error
						? String(error.code)
						: "";
				if (code === "CONFLICT") {
					const data = (error as { data?: { version?: number } }).data;
					setConflictVersion(data?.version ?? null);
					setFailure(null);
				} else {
					setFailure(code === "FORBIDDEN" ? "forbidden" : "failed");
				}
			},
		}),
	);

	const reload = async () => {
		await query.refetch();
		setDraft(null);
		setConflictVersion(null);
	};

	const total = draft ? criteriaTotal(draft.criteria) : 100;
	const dirty = Boolean(draft && original && isDirty(original, draft));
	const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
		draft && setDraft({ ...draft, [key]: value });

	const submit = () => {
		if (!hackathon || !draft) {
			return;
		}
		save.mutate({
			slug: SLUG,
			expectedVersion: hackathon.version,
			name: draft.name,
			organizationSlug: draft.organizationSlug || undefined,
			summary: draft.summary,
			teamMin: draft.teamMin,
			teamMax: draft.teamMax,
			sourceNote: draft.sourceNote.trim() || null,
			milestones: draft.milestones.flatMap((m) => {
				const startsAt = fromLocalInput(m.startsAt);
				return startsAt
					? [
							{
								key: m.key,
								label: m.label,
								startsAt,
								endsAt: fromLocalInput(m.endsAt),
							},
						]
					: [];
			}),
			criteria: draft.criteria,
		});
	};

	return (
		<AdminFrame title={t("title")} description={t("description")}>
			{query.isError && (
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertTitle>{t("unavailable")}</AlertTitle>
					<AlertDescription>
						{t("unavailableBody")}{" "}
						<Button variant="link" size="sm" onClick={() => query.refetch()}>
							{t("retry")}
						</Button>
					</AlertDescription>
				</Alert>
			)}
			<AdminMasterDetail
				list={
					<GroupedList
						label={t("list")}
						groups={[{ key: "hackathon", label: t("group") }]}
						selectedId={hackathon ? SLUG : null}
						onSelect={() => undefined}
						emptyText={query.isPending ? t("loading") : t("empty")}
						items={
							hackathon
								? [{ id: SLUG, name: hackathon.name, group: "hackathon" }]
								: []
						}
					/>
				}
				detail={
					hackathon && original ? (
						<RecordSheet
							title={hackathon.name}
							editing={Boolean(draft)}
							onEdit={() => setDraft(original)}
						>
							{conflictVersion !== null && (
								<Alert variant="destructive">
									<AlertCircleIcon />
									<AlertTitle>{t("staleTitle")}</AlertTitle>
									<AlertDescription>
										{t("stale", { version: conflictVersion })}{" "}
										<Button variant="link" size="sm" onClick={reload}>
											{t("reload")}
										</Button>
									</AlertDescription>
								</Alert>
							)}
							{failure && (
								<Alert variant="destructive">
									<AlertCircleIcon />
									<AlertDescription>{t(`failure.${failure}`)}</AlertDescription>
								</Alert>
							)}
							{draft ? (
								<>
									<RecordSection title={t("general")}>
										<Field id="h-name" label={t("name")}>
											<Input
												id="h-name"
												value={draft.name}
												onChange={(e) => set("name", e.target.value)}
											/>
										</Field>
										<Field id="h-organizer" label={t("organizer")}>
											<select
												id="h-organizer"
												className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
												value={draft.organizationSlug}
												onChange={(e) =>
													set("organizationSlug", e.target.value)
												}
											>
												{/* The current organizer first, even when its profile is no longer public. */}
												{!(organizations.data?.items ?? []).some(
													(o) => o.slug === hackathon.organizationSlug,
												) && (
													<option
														value={hackathon.organizationSlug ?? ""}
														disabled={!hackathon.organizationSlug}
													>
														{hackathon.organizer}
													</option>
												)}
												{(organizations.data?.items ?? []).map((o) => (
													<option key={o.slug} value={o.slug}>
														{o.name}
													</option>
												))}
											</select>
										</Field>
										<div className="grid grid-cols-2 gap-3">
											<Field id="h-min" label={t("teamMin")}>
												<Input
													id="h-min"
													type="number"
													min={1}
													value={draft.teamMin}
													onChange={(e) =>
														set("teamMin", Number(e.target.value))
													}
												/>
											</Field>
											<Field id="h-max" label={t("teamMax")}>
												<Input
													id="h-max"
													type="number"
													min={1}
													value={draft.teamMax}
													onChange={(e) =>
														set("teamMax", Number(e.target.value))
													}
												/>
											</Field>
										</div>
										<Field id="h-summary" label={t("summary")}>
											<Textarea
												id="h-summary"
												value={draft.summary}
												onChange={(e) => set("summary", e.target.value)}
											/>
										</Field>
										<Field
											id="h-source"
											label={t("sourceNote")}
											description={t("sourceNoteHint")}
										>
											<Textarea
												id="h-source"
												maxLength={500}
												value={draft.sourceNote}
												onChange={(e) => set("sourceNote", e.target.value)}
											/>
										</Field>
									</RecordSection>
									<RecordSection title={t("milestones")}>
										{draft.milestones.map((m, index) => (
											<div
												key={m.key}
												className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"
											>
												<Field id={`m-${m.key}-label`} label={t("label")}>
													<Input
														id={`m-${m.key}-label`}
														value={m.label}
														onChange={(e) =>
															set(
																"milestones",
																draft.milestones.map((x, i) =>
																	i === index
																		? { ...x, label: e.target.value }
																		: x,
																),
															)
														}
													/>
												</Field>
												<Field id={`m-${m.key}-start`} label={t("start")}>
													<Input
														id={`m-${m.key}-start`}
														type="datetime-local"
														value={m.startsAt}
														onChange={(e) =>
															set(
																"milestones",
																draft.milestones.map((x, i) =>
																	i === index
																		? { ...x, startsAt: e.target.value }
																		: x,
																),
															)
														}
													/>
												</Field>
												<Field id={`m-${m.key}-end`} label={t("end")}>
													<Input
														id={`m-${m.key}-end`}
														type="datetime-local"
														value={m.endsAt}
														onChange={(e) =>
															set(
																"milestones",
																draft.milestones.map((x, i) =>
																	i === index
																		? { ...x, endsAt: e.target.value }
																		: x,
																),
															)
														}
													/>
												</Field>
											</div>
										))}
										<p className="text-muted-foreground text-xs">
											{t("timezone")}
										</p>
									</RecordSection>
									<RecordSection title={t("criteria")}>
										{draft.criteria.map((c, index) => (
											<div
												key={c.label}
												className="grid grid-cols-[1fr_6rem] gap-3"
											>
												<Field id={`c-${index}-label`} label={t("label")}>
													<Input
														id={`c-${index}-label`}
														value={c.label}
														onChange={(e) =>
															set(
																"criteria",
																draft.criteria.map((x, i) =>
																	i === index
																		? { ...x, label: e.target.value }
																		: x,
																),
															)
														}
													/>
												</Field>
												<Field id={`c-${index}-weight`} label={t("weight")}>
													<Input
														id={`c-${index}-weight`}
														type="number"
														min={0}
														max={100}
														value={c.weight}
														onChange={(e) =>
															set(
																"criteria",
																draft.criteria.map((x, i) =>
																	i === index
																		? { ...x, weight: Number(e.target.value) }
																		: x,
																),
															)
														}
													/>
												</Field>
											</div>
										))}
										<p
											aria-live="polite"
											className={
												total === 100
													? "text-muted-foreground text-sm"
													: "font-medium text-destructive text-sm"
											}
										>
											{t("total", { total })}{" "}
											{total === 100 ? "" : t("mustBe100")}
										</p>
									</RecordSection>
									{confirming && (
										<RecordSection title={t("confirmTitle")}>
											<p className="text-sm">{t("confirmBody")}</p>
											<div className="flex flex-wrap gap-2">
												<ConfirmTwoStep
													label={t("confirmAction")}
													confirmLabel={(seconds) => tc("confirm", { seconds })}
													cancelLabel={tc("cancel")}
													disabled={save.isPending}
													onConfirm={submit}
												/>
												<Button
													variant="outline"
													onClick={() => setConfirming(false)}
												>
													{tc("cancel")}
												</Button>
											</div>
										</RecordSection>
									)}
									<SaveBar
										dirty={dirty && total === 100}
										saving={save.isPending}
										saveLabel={tc("save")}
										discardLabel={tc("cancel")}
										dirtyText={tc("dirty")}
										cleanText={tc("clean")}
										onSave={() => setConfirming(true)}
										onDiscard={() => {
											setDraft(null);
											setConfirming(false);
										}}
									/>
									<p className="text-muted-foreground text-xs">
										{t("noDelete")}
									</p>
								</>
							) : (
								<>
									<RecordSection title={t("general")}>
										<RecordFields
											fields={[
												{ label: t("organizer"), value: hackathon.organizer },
												{
													label: t("team"),
													value: t("teamRange", {
														min: hackathon.teamMin,
														max: hackathon.teamMax,
													}),
												},
												{ label: t("summary"), value: hackathon.summary },
												{
													label: t("sourceNote"),
													value: hackathon.sourceNote ?? "—",
												},
												{ label: t("version"), value: hackathon.version },
											]}
										/>
									</RecordSection>
									<RecordSection title={t("milestones")}>
										<RecordFields
											fields={hackathon.milestones.map((m) => ({
												label: m.label,
												value: dateFormat.format(new Date(m.startsAt)),
											}))}
										/>
									</RecordSection>
									<RecordSection title={t("criteria")}>
										<RecordFields
											fields={hackathon.criteria.map((c) => ({
												label: c.label,
												value: `${c.weight} %`,
											}))}
										/>
									</RecordSection>
								</>
							)}
						</RecordSheet>
					) : (
						<p className="text-muted-foreground text-sm">
							{query.isPending ? t("loading") : t("empty")}
						</p>
					)
				}
			/>
		</AdminFrame>
	);
}
