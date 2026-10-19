"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import AdminFrame from "@/components/admin-frame";
import { adminErrorKey } from "@/i18n/errors";
import { orpc } from "@/utils/orpc";

/** Reported job postings (#258): a founded report removes the posting; two suspend the Organization. */
export default function AdminJobsPage() {
	const t = useTranslations("admin.jobs");
	const queryClient = useQueryClient();
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

	return (
		<AdminFrame title={t("title")} description={t("description")}>
			{(queue.data?.items.length ?? 0) === 0 ? (
				<p className="text-muted-foreground text-sm">{t("none")}</p>
			) : (
				<ul className="grid gap-3">
					{queue.data?.items.map((job) => (
						<li
							key={job.id}
							className="grid gap-1 rounded-xl border p-4 text-sm"
						>
							<a
								href={`/jobs/${job.id}`}
								target="_blank"
								rel="noopener noreferrer"
								className="font-semibold hover:underline"
							>
								{job.title}
							</a>
							<span className="text-muted-foreground text-xs">
								{job.organization.name} · {t("reports", { count: job.reports })}
							</span>
							<ul className="list-disc pl-5 text-destructive text-xs">
								{job.reasons.map((reason, i) => (
									<li key={`${job.id}-${i}`}>{reason}</li>
								))}
							</ul>
							<span className="flex flex-wrap gap-2 pt-1">
								<Button
									size="sm"
									variant="destructive"
									onClick={() => {
										const reason = window.prompt(t("reason"))?.trim();
										if (reason) uphold.mutate({ id: job.id, reason });
									}}
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
		</AdminFrame>
	);
}
