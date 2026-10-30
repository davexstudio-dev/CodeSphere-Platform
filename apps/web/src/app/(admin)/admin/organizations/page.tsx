"use client";

import type { OrganizationStatus } from "@codesphere/contract";
import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { StatStrip } from "@codesphere/ui/components/organisms/stat-strip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";
import { toast } from "sonner";

import { useReasonDecision } from "@/components/admin-decision";
import AdminFrame from "@/components/admin-frame";
import { adminErrorKey } from "@/i18n/errors";
import { orpc } from "@/utils/orpc";

const LIMIT = 50;

const useStatus = (status: OrganizationStatus) =>
	useQuery(
		orpc.admin.organizations.list.queryOptions({
			input: { limit: LIMIT, status },
		}),
	);

/** Back-office of the Organizations (#257): applications to validate, suspensions. Each decision is audited. */
export default function AdminOrganizationsPage() {
	const t = useTranslations("admin.organizations");
	const format = useFormatter();
	const queryClient = useQueryClient();
	const { ask, dialog } = useReasonDecision();
	const pendingId = useId();
	const lists = {
		pending: useStatus("pending"),
		validated: useStatus("validated"),
		suspended: useStatus("suspended"),
		rejected: useStatus("rejected"),
	};
	const done = () => {
		void queryClient.invalidateQueries({
			queryKey: orpc.admin.organizations.key(),
		});
		void queryClient.invalidateQueries({ queryKey: orpc.admin.auditLog.key() });
	};
	const options = {
		onSuccess: done,
		onError: (error: unknown) => {
			toast.error(t(`errors.${adminErrorKey(error)}`));
			done();
		},
	};
	const validate = useMutation(
		orpc.admin.organizations.validate.mutationOptions(options),
	);
	const reject = useMutation(
		orpc.admin.organizations.reject.mutationOptions(options),
	);
	const suspend = useMutation(
		orpc.admin.organizations.suspend.mutationOptions(options),
	);
	const reinstate = useMutation(
		orpc.admin.organizations.reinstate.mutationOptions(options),
	);
	const pending = lists.pending.data?.items ?? [];
	const others = (["validated", "suspended", "rejected"] as const).map(
		(status) => ({ status, items: lists[status].data?.items ?? [] }),
	);

	return (
		<AdminFrame title={t("title")} description={t("description")}>
			<StatStrip
				className="sm:grid-cols-2 lg:grid-cols-4"
				items={(Object.keys(lists) as (keyof typeof lists)[]).map((status) => {
					const count = lists[status].data?.items.length ?? 0;
					return {
						label: t(`status.${status}`),
						value: count === LIMIT ? `${LIMIT}+` : String(count),
					};
				})}
			/>
			<section aria-labelledby={pendingId} className="grid gap-3">
				<h2 id={pendingId} className="font-semibold text-lg">
					{t("status.pending")}
				</h2>
				{pending.length === 0 ? (
					<p className="text-muted-foreground text-sm">{t("none")}</p>
				) : (
					<ul className="grid gap-4 md:grid-cols-2">
						{pending.map((org) => {
							const target = { id: org.id, expectedVersion: org.version };
							return (
								<li
									key={org.id}
									className="grid content-start gap-2 rounded-xl border bg-card p-5 text-sm"
								>
									<span className="flex flex-wrap items-center gap-2">
										<span className="font-semibold text-base">{org.name}</span>
										<Badge variant="outline">{org.country}</Badge>
									</span>
									<a
										href={org.website}
										target="_blank"
										rel="noopener noreferrer nofollow"
										className="text-muted-foreground hover:underline"
									>
										{org.website}
									</a>
									{org.contactEmail && <span>{org.contactEmail}</span>}
									{org.description && <p>{org.description}</p>}
									<span className="text-muted-foreground text-xs">
										{t("requestedBy", { name: org.ownerName ?? "—" })} ·{" "}
										{format.dateTime(new Date(org.createdAt), {
											dateStyle: "medium",
										})}
									</span>
									<span className="flex flex-wrap gap-2 pt-1">
										<Button size="sm" onClick={() => validate.mutate(target)}>
											{t("validate")}
										</Button>
										<Button
											size="sm"
											variant="destructive"
											onClick={() =>
												ask({
													title: org.name,
													description: t("reasonReject"),
													confirmLabel: t("reject"),
													reasonLabel: t("reasonReject"),
													onSubmit: (reason) =>
														reject.mutate({ ...target, reason }),
												})
											}
										>
											{t("reject")}
										</Button>
									</span>
								</li>
							);
						})}
					</ul>
				)}
			</section>
			{others.map(({ status, items }) => (
				<section
					key={status}
					aria-label={t(`status.${status}`)}
					className="grid gap-3"
				>
					<h2 className="font-semibold text-lg">{t(`status.${status}`)}</h2>
					{items.length === 0 ? (
						<p className="text-muted-foreground text-sm">{t("none")}</p>
					) : (
						<ul className="divide-y divide-border rounded-xl border bg-card">
							{items.map((org) => {
								const target = { id: org.id, expectedVersion: org.version };
								return (
									<li
										key={org.id}
										className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm"
									>
										<span className="font-medium">{org.name}</span>
										<Badge variant="outline">{org.country}</Badge>
										{org.system && (
											<Badge variant="secondary">{t("system")}</Badge>
										)}
										<a
											href={org.website}
											target="_blank"
											rel="noopener noreferrer nofollow"
											className="min-w-0 flex-[1_1_10rem] truncate text-muted-foreground text-xs hover:underline"
										>
											{org.website}
										</a>
										{org.statusReason && (
											<span className="w-full text-muted-foreground text-xs">
												{org.statusReason}
											</span>
										)}
										{org.status === "validated" && (
											<Button
												size="sm"
												variant="destructive"
												onClick={() =>
													ask({
														title: org.name,
														description: t("reasonSuspend"),
														confirmLabel: t("suspend"),
														reasonLabel: t("reasonSuspend"),
														onSubmit: (reason) =>
															suspend.mutate({ ...target, reason }),
													})
												}
											>
												{t("suspend")}
											</Button>
										)}
										{org.status === "suspended" && (
											<Button
												size="sm"
												onClick={() => reinstate.mutate(target)}
											>
												{t("reinstate")}
											</Button>
										)}
									</li>
								);
							})}
						</ul>
					)}
				</section>
			))}
			{dialog}
		</AdminFrame>
	);
}
