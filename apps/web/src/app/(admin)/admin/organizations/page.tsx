"use client";

import type { OrganizationStatus } from "@codesphere/contract";
import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import AdminFrame from "@/components/admin-frame";
import { adminErrorKey } from "@/i18n/errors";
import { orpc } from "@/utils/orpc";

const STATUSES: readonly OrganizationStatus[] = [
	"pending",
	"validated",
	"suspended",
	"rejected",
];

/** Back-office of the Organizations (#257): applications to validate, suspensions. Each decision is audited. */
export default function AdminOrganizationsPage() {
	const t = useTranslations("admin.organizations");
	const format = useFormatter();
	const queryClient = useQueryClient();
	const [status, setStatus] = useState<OrganizationStatus>("pending");
	const list = useQuery(
		orpc.admin.organizations.list.queryOptions({
			input: { limit: 50, status },
		}),
	);
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
	const ask = (label: string) => window.prompt(label)?.trim() || null;

	return (
		<AdminFrame title={t("title")} description={t("description")}>
			<div className="flex flex-wrap gap-2">
				{STATUSES.map((s) => (
					<Button
						key={s}
						size="sm"
						variant={s === status ? "default" : "outline"}
						aria-pressed={s === status}
						onClick={() => setStatus(s)}
					>
						{t(`status.${s}`)}
					</Button>
				))}
			</div>
			{(list.data?.items.length ?? 0) === 0 ? (
				<p className="text-muted-foreground text-sm">{t("none")}</p>
			) : (
				<ul className="grid gap-3">
					{list.data?.items.map((org) => {
						const target = { id: org.id, expectedVersion: org.version };
						return (
							<li
								key={org.id}
								className="grid gap-1 rounded-xl border p-4 text-sm"
							>
								<span className="flex flex-wrap items-center gap-2">
									<span className="font-semibold">{org.name}</span>
									<Badge variant="outline">{org.country}</Badge>
									{org.system && (
										<Badge variant="secondary">{t("system")}</Badge>
									)}
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
								{org.statusReason && (
									<span className="text-muted-foreground text-xs">
										{org.statusReason}
									</span>
								)}
								<span className="flex flex-wrap gap-2 pt-1">
									{org.status === "pending" && (
										<>
											<Button size="sm" onClick={() => validate.mutate(target)}>
												{t("validate")}
											</Button>
											<Button
												size="sm"
												variant="destructive"
												onClick={() => {
													const reason = ask(t("reasonReject"));
													if (reason) reject.mutate({ ...target, reason });
												}}
											>
												{t("reject")}
											</Button>
										</>
									)}
									{org.status === "validated" && (
										<Button
											size="sm"
											variant="destructive"
											onClick={() => {
												const reason = ask(t("reasonSuspend"));
												if (reason) suspend.mutate({ ...target, reason });
											}}
										>
											{t("suspend")}
										</Button>
									)}
									{org.status === "suspended" && (
										<Button size="sm" onClick={() => reinstate.mutate(target)}>
											{t("reinstate")}
										</Button>
									)}
								</span>
							</li>
						);
					})}
				</ul>
			)}
		</AdminFrame>
	);
}
