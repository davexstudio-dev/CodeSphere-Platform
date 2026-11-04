"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@codesphere/ui/components/molecules/alert";
import { CadevBanner } from "@codesphere/ui/components/molecules/cadev-banner";
import { ConfirmTwoStep } from "@codesphere/ui/components/molecules/confirm-two-step";
import { GroupedList } from "@codesphere/ui/components/molecules/grouped-list";
import { AdminMasterDetail } from "@codesphere/ui/components/organisms/admin-master-detail";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircleIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { useReasonDecision } from "@/components/admin-decision";
import AdminFrame from "@/components/admin-frame";
import { CreateHackathon } from "@/components/hackathon/create-hackathon";
import { HackathonRecord } from "@/components/hackathon/edit-hackathon";
import { submissionClose } from "@/lib/home";
import { orpc } from "@/utils/orpc";

export default function AdminHackathonsPage() {
	const t = useTranslations("admin.hackathons");
	const tc = useTranslations("admin.common");
	const tb = useTranslations("home.banner");
	const locale = useLocale();
	const queryClient = useQueryClient();
	const { ask, dialog } = useReasonDecision();
	const query = useQuery(
		orpc.admin.hackathons.list.queryOptions({ input: {} }),
	);
	const [selected, setSelected] = useState<string | null>(null);
	const hackathons = query.data?.items ?? [];
	const hackathon =
		hackathons.find((h) => h.slug === selected) ?? hackathons[0];
	const slug = hackathon?.slug ?? "";
	// Only validated Organizations can list a Hackathon (#257).
	const organizations = useQuery(
		orpc.organizations.list.queryOptions({ input: { limit: 50 } }),
	);
	const [failure, setFailure] = useState<"advance" | null>(null);

	const refresh = () => {
		void queryClient.invalidateQueries({
			queryKey: orpc.admin.hackathons.key(),
		});
		void queryClient.invalidateQueries({ queryKey: orpc.hackathons.key() });
		void queryClient.invalidateQueries({ queryKey: orpc.admin.auditLog.key() });
	};
	const allow = useMutation(
		orpc.admin.hackathons.allowRepublication.mutationOptions({
			onSuccess: () => {
				refresh();
				setFailure(null);
			},
			onError: () => {
				refresh();
				setFailure("advance");
			},
		}),
	);
	const reports = useQuery(
		orpc.admin.hackathons.reports.queryOptions({ input: {} }),
	);
	const reported = reports.data?.items ?? [];
	const openReports = reported.find((r) => r.slug === slug)?.reports ?? [];
	const dismiss = useMutation(
		orpc.admin.hackathons.dismissReports.mutationOptions({
			onSuccess: () => {
				refresh();
				void queryClient.invalidateQueries({
					queryKey: orpc.admin.hackathons.reports.key(),
				});
			},
			onError: () => setFailure("advance"),
		}),
	);
	const unpublish = useMutation(
		orpc.admin.hackathons.unpublish.mutationOptions({
			onSuccess: () => {
				refresh();
				setFailure(null);
			},
			onError: () => {
				refresh();
				setFailure("advance");
			},
		}),
	);
	const advance = useMutation(
		orpc.admin.hackathons.advance.mutationOptions({
			onSuccess: () => {
				refresh();
				setFailure(null);
			},
			onError: () => {
				refresh();
				setFailure("advance");
			},
		}),
	);

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
			{reported.length > 0 && (
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertTitle>
						{t("reportedTitle", { count: reported.length })}
					</AlertTitle>
					<AlertDescription className="flex flex-wrap gap-2">
						{reported.map((item) => (
							<Button
								key={item.slug}
								size="sm"
								variant="outline"
								onClick={() => {
									setSelected(item.slug);
								}}
							>
								{item.name} ({item.reports.length})
							</Button>
						))}
					</AlertDescription>
				</Alert>
			)}
			<AdminMasterDetail
				list={
					<GroupedList
						label={t("list")}
						groups={(["published", "draft", "ended", "archived"] as const).map(
							(status) => ({
								key: status,
								label: t(`statusGroup.${status}`),
							}),
						)}
						selectedId={hackathon?.slug ?? null}
						onSelect={(item) => {
							setSelected(item.id);
							setFailure(null);
						}}
						actions={
							<CreateHackathon
								organizations={organizations.data?.items ?? []}
								onCreated={(created) => {
									refresh();
									setSelected(created);
								}}
							/>
						}
						emptyText={query.isPending ? t("loading") : t("empty")}
						items={hackathons.map((h) => ({
							id: h.slug,
							name: h.name,
							group: h.status,
						}))}
					/>
				}
				detail={
					hackathon ? (
						<div className="grid gap-6">
							{hackathon.milestones.length > 0 && (
								<CadevBanner
									name={hackathon.name}
									summary={hackathon.summary}
									closesAt={
										submissionClose(hackathon.milestones) ??
										hackathon.verifiedAt
									}
									milestones={hackathon.milestones}
									locale={locale}
									labels={{
										eyebrow: t(`status.${hackathon.status}`),
										days: tb("days"),
										daysShort: tb("daysShort"),
										hours: tb("hours"),
										remaining: (days) => tb("remaining", { days }),
										timeline: tb("timeline"),
									}}
								/>
							)}
							{hackathon.status !== "archived" && (
								<div className="grid justify-items-start gap-1">
									<ConfirmTwoStep
										label={t(`advance.${hackathon.status}`)}
										confirmLabel={(seconds) => tc("confirm", { seconds })}
										cancelLabel={tc("cancel")}
										onConfirm={() =>
											advance.mutate({
												slug,
												expectedVersion: hackathon.version,
											})
										}
									/>
									<p className="text-muted-foreground text-xs">
										{t(`advanceNote.${hackathon.status}`)}
									</p>
									{openReports.length > 0 && (
										<div className="grid gap-1 rounded-xl border border-destructive/40 p-3">
											<p className="font-medium text-sm">
												{t("reports", { count: openReports.length })}
											</p>
											<ul className="grid gap-1 text-sm">
												{openReports.map((r, index) => (
													<li key={`${r.reason}-${index}`}>
														{t(`reportReasons.${r.reason}`)}
														{r.comment ? ` : ${r.comment}` : ""}
													</li>
												))}
											</ul>
											<Button
												size="sm"
												variant="outline"
												className="w-fit"
												disabled={dismiss.isPending}
												onClick={() => dismiss.mutate({ slug })}
											>
												{t("dismissReports")}
											</Button>
											<p className="text-muted-foreground text-xs">
												{t("reportsHint")}
											</p>
										</div>
									)}
									{hackathon.status === "draft" &&
										hackathon.unpublishedReason && (
											<div className="grid gap-1">
												<p className="text-destructive text-xs">
													{t("unpublishedBy", {
														reason: hackathon.unpublishedReason,
													})}
												</p>
												<Button
													size="sm"
													variant="outline"
													disabled={allow.isPending}
													onClick={() =>
														allow.mutate({
															slug,
															expectedVersion: hackathon.version,
														})
													}
												>
													{t("allowRepublication")}
												</Button>
											</div>
										)}
									{(hackathon.status === "published" ||
										hackathon.status === "ended") && (
										<Button
											size="sm"
											variant="destructive"
											onClick={() =>
												ask({
													title: hackathon.name,
													description: t("unpublishDescription"),
													confirmLabel: t("unpublish"),
													reasonLabel: t("unpublishReason"),
													onSubmit: (reason) =>
														unpublish.mutate({
															slug,
															expectedVersion: hackathon.version,
															reason,
														}),
												})
											}
										>
											{t("unpublish")}
										</Button>
									)}
								</div>
							)}
							{failure && (
								<Alert variant="destructive">
									<AlertCircleIcon />
									<AlertDescription>{t(`failure.${failure}`)}</AlertDescription>
								</Alert>
							)}
							<HackathonRecord
								key={`${hackathon.slug}-${hackathon.version}`}
								hackathon={hackathon}
								organizations={organizations.data?.items ?? []}
								onSaved={() => {
									refresh();
									setFailure(null);
								}}
								onReload={() => query.refetch()}
							/>
						</div>
					) : (
						<p className="text-muted-foreground text-sm">
							{query.isPending ? t("loading") : t("empty")}
						</p>
					)
				}
			/>
			{dialog}
		</AdminFrame>
	);
}
