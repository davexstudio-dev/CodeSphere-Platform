"use client";

import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { StatStrip } from "@codesphere/ui/components/organisms/stat-strip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useReasonDecision } from "@/components/admin-decision";
import AdminFrame from "@/components/admin-frame";
import { adminErrorKey } from "@/i18n/errors";
import { orpc } from "@/utils/orpc";

/** Reported job postings (#258): a founded report removes the posting; two suspend the Organization. */
export default function AdminJobsPage() {
	const t = useTranslations("admin.jobs");
	const queryClient = useQueryClient();
	const { ask, dialog } = useReasonDecision();
	const queue = useQuery(
		orpc.admin.jobs.review.queryOptions({ input: { limit: 50 } }),
	);
	const done = () => {
		void queryClient.invalidateQueries({ queryKey: orpc.admin.jobs.key() });
		void queryClient.invalidateQueries({ queryKey: orpc.admin.auditLog.key() });
	};
	const onError = (error: unknown) => {
		toast.error(t(`errors.${adminErrorKey(error)}`));
		done();
	};
	const uphold = useMutation(
		orpc.admin.jobs.uphold.mutationOptions({
			onError,
			onSuccess: (result) => {
				done();
				if (result.organizationSuspended) {
					toast.warning(t("suspended"));
				}
			},
		}),
	);
	const dismiss = useMutation(
		orpc.admin.jobs.dismiss.mutationOptions({ onError, onSuccess: done }),
	);
	const items = queue.data?.items ?? [];

	return (
		<AdminFrame title={t("title")} description={t("description")}>
			<StatStrip
				className="sm:grid-cols-2 lg:grid-cols-2"
				items={[
					{ label: t("stats.jobs"), value: String(items.length) },
					{
						label: t("stats.reports"),
						value: String(items.reduce((sum, job) => sum + job.reports, 0)),
					},
				]}
			/>
			{items.length === 0 ? (
				<p className="text-muted-foreground text-sm">{t("none")}</p>
			) : (
				<ul className="grid gap-4 md:grid-cols-2">
					{items.map((job) => (
						<li
							key={job.id}
							className="grid content-start gap-3 rounded-xl border bg-card p-5 text-sm"
						>
							<div className="flex flex-wrap items-start justify-between gap-2">
								<a
									href={`/jobs/${job.id}`}
									target="_blank"
									rel="noopener noreferrer"
									className="min-w-0 flex-[1_1_12rem] font-semibold text-base leading-snug hover:underline"
								>
									{job.title}
								</a>
								<Badge variant="destructive">
									{t("reports", { count: job.reports })}
								</Badge>
							</div>
							<p className="text-muted-foreground">{job.organization.name}</p>
							<ul className="list-disc pl-5 text-xs">
								{job.reasons.map((reason, i) => (
									<li key={`${job.id}-${i}`}>{reason}</li>
								))}
							</ul>
							<span className="flex flex-wrap gap-2">
								<Button
									size="sm"
									variant="destructive"
									onClick={() =>
										ask({
											title: job.title,
											description: t("description"),
											confirmLabel: t("uphold"),
											reasonLabel: t("reason"),
											onSubmit: (reason) =>
												uphold.mutate({ id: job.id, reason }),
										})
									}
								>
									{t("uphold")}
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={() => dismiss.mutate({ id: job.id })}
								>
									{t("dismiss")}
								</Button>
							</span>
						</li>
					))}
				</ul>
			)}
			{dialog}
		</AdminFrame>
	);
}
