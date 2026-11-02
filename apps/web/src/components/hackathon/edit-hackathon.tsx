"use client";

import type { AdminHackathon } from "@codesphere/contract";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Switch } from "@codesphere/ui/components/atoms/switch";
import { Textarea } from "@codesphere/ui/components/atoms/textarea";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@codesphere/ui/components/molecules/alert";
import { ConfirmTwoStep } from "@codesphere/ui/components/molecules/confirm-two-step";
import { Field } from "@codesphere/ui/components/molecules/field";
import { SaveBar } from "@codesphere/ui/components/molecules/save-bar";
import {
	RecordFields,
	RecordSection,
	RecordSheet,
} from "@codesphere/ui/components/organisms/record-sheet";
import { useMutation } from "@tanstack/react-query";
import {
	AlertCircleIcon,
	ArrowDownIcon,
	ArrowUpIcon,
	XIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import {
	criteriaTotal,
	draftOf,
	type HackathonDraft,
	isDirty,
	prizesComplete,
	updateOf,
} from "@/lib/admin-hackathon";
import { orpc } from "@/utils/orpc";

type Failure = "forbidden" | "failed" | "teamsLocked" | "archivedLocked";

function failureOf(error: unknown, scope: "admin" | "organization"): Failure {
	const code =
		typeof error === "object" && error !== null && "code" in error
			? String(error.code)
			: "";
	if (code === "FORBIDDEN") {
		return scope === "organization" ? "archivedLocked" : "forbidden";
	}
	if (code === "BAD_REQUEST") {
		const issues = (error as { data?: { issues?: { path?: unknown[] }[] } })
			.data?.issues;
		const field = String(issues?.[0]?.path?.[0] ?? "");
		if (field === "teamsEnabled" || field === "teamMax") {
			return "teamsLocked";
		}
	}
	return "failed";
}

/**
 * The record and edit form of a Hackathon, shared by the Admin screen and the Organization space
 * (#338). `scope` picks the save call (`admin.hackathons.update` or
 * `organizations.hackathons.update`); an Organization cannot change the organizer, so the field
 * is read-only there.
 */
export function HackathonRecord({
	hackathon,
	scope = "admin",
	organizations = [],
	startEditing = false,
	onSaved,
	onReload,
	onDiscard,
}: {
	hackathon: AdminHackathon;
	scope?: "admin" | "organization";
	/** The validated Organizations an Admin may pick as the organizer. */
	organizations?: readonly { slug: string; name: string }[];
	/** Opens straight in the form (the Organization space shows it in a dialog). */
	startEditing?: boolean;
	onSaved: () => void;
	/** Fetches the Hackathon again after a version conflict. */
	onReload: () => Promise<unknown>;
	/** Called when the form is closed without saving, when it opened in edit mode. */
	onDiscard?: () => void;
}) {
	const t = useTranslations("admin.hackathons");
	const tc = useTranslations("admin.common");
	const locale = useLocale();
	const dateFormat = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});
	const original = draftOf(hackathon);
	const [draft, setDraft] = useState<HackathonDraft | null>(
		startEditing ? original : null,
	);
	const [confirming, setConfirming] = useState(false);
	const [conflictVersion, setConflictVersion] = useState<number | null>(null);
	const [failure, setFailure] = useState<Failure | null>(null);

	const onSuccess = () => {
		onSaved();
		setDraft(null);
		setConfirming(false);
		setConflictVersion(null);
		setFailure(null);
	};
	const onError = (error: unknown) => {
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
			setFailure(failureOf(error, scope));
		}
	};
	const adminSave = useMutation(
		orpc.admin.hackathons.update.mutationOptions({ onSuccess, onError }),
	);
	const organizationSave = useMutation(
		orpc.organizations.hackathons.update.mutationOptions({
			onSuccess,
			onError,
		}),
	);
	const save = scope === "organization" ? organizationSave : adminSave;

	const reload = async () => {
		await onReload();
		setDraft(null);
		setConflictVersion(null);
	};
	const close = () => {
		setDraft(null);
		setConfirming(false);
		onDiscard?.();
	};

	const total = draft ? criteriaTotal(draft.criteria) : 100;
	const complete = draft ? prizesComplete(draft.prizes) : true;
	const dirty = Boolean(draft && isDirty(original, draft));
	const set = <K extends keyof HackathonDraft>(
		key: K,
		value: HackathonDraft[K],
	) => draft && setDraft({ ...draft, [key]: value });

	const submit = () => {
		if (!draft) {
			return;
		}
		save.mutate(updateOf(hackathon, draft, { organizer: scope === "admin" }));
	};

	const movePrize = (index: number, by: -1 | 1) => {
		if (!draft) {
			return;
		}
		const prizes = [...draft.prizes];
		const [moved] = prizes.splice(index, 1);
		if (moved) {
			prizes.splice(index + by, 0, moved);
			set("prizes", prizes);
		}
	};

	return (
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
						{scope === "admin" ? (
							<Field id="h-organizer" label={t("organizer")}>
								<select
									id="h-organizer"
									className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
									value={draft.organizationSlug}
									onChange={(e) => set("organizationSlug", e.target.value)}
								>
									{/* The current organizer first, even when its profile is no longer public. */}
									{!organizations.some(
										(o) => o.slug === hackathon.organizationSlug,
									) && (
										<option
											value={hackathon.organizationSlug ?? ""}
											disabled={!hackathon.organizationSlug}
										>
											{hackathon.organizer}
										</option>
									)}
									{organizations.map((o) => (
										<option key={o.slug} value={o.slug}>
											{o.name}
										</option>
									))}
								</select>
							</Field>
						) : (
							<Field
								id="h-organizer"
								label={t("organizer")}
								description={t("organizerLocked")}
							>
								<Input id="h-organizer" readOnly value={hackathon.organizer} />
							</Field>
						)}
						<div className="grid grid-cols-2 gap-3">
							<Field id="h-min" label={t("teamMin")}>
								<Input
									id="h-min"
									type="number"
									min={1}
									value={draft.teamMin}
									onChange={(e) => set("teamMin", Number(e.target.value))}
								/>
							</Field>
							<Field id="h-max" label={t("teamMax")}>
								<Input
									id="h-max"
									type="number"
									min={1}
									value={draft.teamMax}
									onChange={(e) => set("teamMax", Number(e.target.value))}
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
							id="h-teams"
							label={t("teamsEnabled")}
							description={t("teamsEnabledHint")}
						>
							<Switch
								id="h-teams"
								aria-label={t("teamsEnabled")}
								checked={draft.teamsEnabled}
								onCheckedChange={(checked) => set("teamsEnabled", checked)}
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
													i === index ? { ...x, label: e.target.value } : x,
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
													i === index ? { ...x, startsAt: e.target.value } : x,
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
													i === index ? { ...x, endsAt: e.target.value } : x,
												),
											)
										}
									/>
								</Field>
							</div>
						))}
						{hackathon.status === "draft" && (
							<Button
								size="sm"
								variant="outline"
								className="justify-self-start"
								onClick={() =>
									set("milestones", [
										...draft.milestones,
										{
											key: `step-${crypto.randomUUID().slice(0, 8)}`,
											label: t("newMilestone"),
											startsAt: "",
											endsAt: "",
										},
									])
								}
							>
								{t("addMilestone")}
							</Button>
						)}
						<p className="text-muted-foreground text-xs">{t("timezone")}</p>
					</RecordSection>
					<RecordSection title={t("prizes")}>
						{draft.prizes.length === 0 && (
							<p className="text-muted-foreground text-sm">{t("noPrizes")}</p>
						)}
						{draft.prizes.map((p, index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: prizes have no id; the list is ordered and edited in place.
							<div key={index} className="grid gap-3 rounded-lg border p-3">
								<div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
									<Field id={`p-${index}-label`} label={t("label")}>
										<Input
											id={`p-${index}-label`}
											maxLength={160}
											value={p.label}
											onChange={(e) =>
												set(
													"prizes",
													draft.prizes.map((x, i) =>
														i === index ? { ...x, label: e.target.value } : x,
													),
												)
											}
										/>
									</Field>
									<Field id={`p-${index}-amount`} label={t("prizeAmount")}>
										<Input
											id={`p-${index}-amount`}
											maxLength={80}
											value={p.amount}
											onChange={(e) =>
												set(
													"prizes",
													draft.prizes.map((x, i) =>
														i === index ? { ...x, amount: e.target.value } : x,
													),
												)
											}
										/>
									</Field>
								</div>
								<Field
									id={`p-${index}-conditions`}
									label={t("prizeConditions")}
								>
									<Textarea
										id={`p-${index}-conditions`}
										maxLength={500}
										value={p.conditions}
										onChange={(e) =>
											set(
												"prizes",
												draft.prizes.map((x, i) =>
													i === index
														? { ...x, conditions: e.target.value }
														: x,
												),
											)
										}
									/>
								</Field>
								<div className="flex gap-1">
									<Button
										size="icon"
										variant="outline"
										aria-label={t("prizeUp")}
										title={t("prizeUp")}
										disabled={index === 0}
										onClick={() => movePrize(index, -1)}
									>
										<ArrowUpIcon />
									</Button>
									<Button
										size="icon"
										variant="outline"
										aria-label={t("prizeDown")}
										title={t("prizeDown")}
										disabled={index === draft.prizes.length - 1}
										onClick={() => movePrize(index, 1)}
									>
										<ArrowDownIcon />
									</Button>
									<Button
										size="icon"
										variant="outline"
										aria-label={t("prizeRemove")}
										title={t("prizeRemove")}
										onClick={() =>
											set(
												"prizes",
												draft.prizes.filter((_, i) => i !== index),
											)
										}
									>
										<XIcon />
									</Button>
								</div>
							</div>
						))}
						{draft.prizes.length < 20 && (
							<Button
								size="sm"
								variant="outline"
								className="justify-self-start"
								onClick={() =>
									set("prizes", [
										...draft.prizes,
										{ label: "", amount: "", conditions: "" },
									])
								}
							>
								{t("addPrize")}
							</Button>
						)}
						{!complete && (
							<p className="font-medium text-destructive text-sm">
								{t("prizeLabelRequired")}
							</p>
						)}
					</RecordSection>
					<RecordSection title={t("criteria")}>
						{draft.criteria.map((c, index) => (
							<div key={c.label} className="grid grid-cols-[1fr_6rem] gap-3">
								<Field id={`c-${index}-label`} label={t("label")}>
									<Input
										id={`c-${index}-label`}
										value={c.label}
										onChange={(e) =>
											set(
												"criteria",
												draft.criteria.map((x, i) =>
													i === index ? { ...x, label: e.target.value } : x,
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
							{t("total", { total })} {total === 100 ? "" : t("mustBe100")}
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
								<Button variant="outline" onClick={() => setConfirming(false)}>
									{tc("cancel")}
								</Button>
							</div>
						</RecordSection>
					)}
					<SaveBar
						dirty={dirty && total === 100 && complete}
						saving={save.isPending}
						saveLabel={tc("save")}
						discardLabel={tc("cancel")}
						dirtyText={tc("dirty")}
						cleanText={tc("clean")}
						onSave={() => setConfirming(true)}
						onDiscard={close}
					/>
					<p className="text-muted-foreground text-xs">{t("noDelete")}</p>
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
									label: t("teamsEnabled"),
									value: hackathon.teamsEnabled ? t("yes") : t("no"),
								},
								{
									label: t("submissions"),
									value: hackathon.teamsEnabled
										? hackathon.submissionCount
										: t("submissionsElsewhere"),
								},
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
					<RecordSection title={t("prizes")}>
						{hackathon.prizes.length === 0 ? (
							<p className="text-muted-foreground text-sm">{t("noPrizes")}</p>
						) : (
							<RecordFields
								fields={hackathon.prizes.map((p) => ({
									label: p.label,
									value:
										[p.amount, p.conditions].filter(Boolean).join(" — ") || "—",
								}))}
							/>
						)}
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
	);
}
