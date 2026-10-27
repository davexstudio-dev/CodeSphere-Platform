"use client";

import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import {
	RecordFields,
	RecordSection,
} from "@codesphere/ui/components/organisms/record-sheet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import AdminFrame from "@/components/admin-frame";
import { useAdminIdentity } from "@/components/admin-identity";
import Link from "@/components/link";
import LocaleSwitcher from "@/components/locale-switcher";
import { auditActionMessageKey } from "@/lib/audit-target";
import { authClient } from "@/lib/auth-client";
import { describeUserAgent } from "@/lib/user-agent";
import { orpc } from "@/utils/orpc";

/** « Mon compte » (#286): the signed-in staff member's profile, sessions and recent activity. */
export default function AccountPage() {
	const t = useTranslations("admin.account");
	const tRole = useTranslations("admin.staff.roles");
	const identity = useAdminIdentity();
	const role =
		identity?.role === "super_admin" ||
		identity?.role === "admin" ||
		identity?.role === "moderator"
			? identity.role
			: "member";

	return (
		<AdminFrame title={t("title")} description={t("description")}>
			<div className="grid gap-6 xl:grid-cols-2">
				<RecordSection title={t("profile.title")}>
					<RecordFields
						fields={[
							{ label: t("profile.name"), value: identity?.name ?? "—" },
							{ label: t("profile.email"), value: identity?.email ?? "—" },
							{
								label: t("profile.role"),
								value: <Badge variant="outline">{tRole(role)}</Badge>,
							},
						]}
					/>
					<p className="text-muted-foreground text-xs">{t("profile.note")}</p>
				</RecordSection>
				<RecordSection title={t("language.title")}>
					<p className="text-muted-foreground text-sm">
						{t("language.description")}
					</p>
					<LocaleSwitcher />
				</RecordSection>
				<Sessions />
				<Activity selfId={identity?.id} />
			</div>
		</AdminFrame>
	);
}

function Sessions() {
	const t = useTranslations("admin.account.sessions");
	const locale = useLocale();
	const queryClient = useQueryClient();
	const [busy, setBusy] = useState(false);
	const current = authClient.useSession();
	const sessions = useQuery({
		queryKey: ["account", "sessions"],
		queryFn: async () => {
			const out = await authClient.listSessions();
			if (out.error) {
				throw new Error(out.error.message);
			}
			return out.data ?? [];
		},
	});
	const dateFormat = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});
	const currentToken = current.data?.session.token;
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: ["account", "sessions"] });

	const run = async (
		action: () => Promise<{ error: unknown }>,
		done: string,
	) => {
		setBusy(true);
		try {
			const out = await action();
			if (out.error) {
				toast.error(t("failed"));
			} else {
				toast.success(done);
			}
		} catch {
			toast.error(t("failed"));
		} finally {
			setBusy(false);
			void refresh();
		}
	};
	const others = (sessions.data ?? []).filter(
		(session) => session.token !== currentToken,
	);

	return (
		<RecordSection title={t("title")} className="xl:col-span-2">
			{sessions.isPending ? (
				<p className="text-muted-foreground text-sm">{t("loading")}</p>
			) : sessions.isError ? (
				<p className="text-destructive text-sm">{t("error")}</p>
			) : (
				<ul className="flex flex-col divide-y divide-border">
					{sessions.data.map((session) => {
						const isCurrent = session.token === currentToken;
						return (
							<li
								key={session.id}
								className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
							>
								<span className="flex min-w-0 flex-col">
									<span className="flex items-center gap-2 font-medium text-sm">
										{describeUserAgent(session.userAgent) ?? t("unknownDevice")}
										{isCurrent && (
											<Badge variant="secondary">{t("current")}</Badge>
										)}
									</span>
									<span className="text-muted-foreground text-xs">
										{t("started", {
											date: dateFormat.format(new Date(session.createdAt)),
										})}
									</span>
								</span>
								{!isCurrent && (
									<Button
										variant="outline"
										size="sm"
										disabled={busy}
										onClick={() =>
											void run(
												() =>
													authClient.revokeSession({ token: session.token }),
												t("revoked"),
											)
										}
									>
										{t("revoke")}
									</Button>
								)}
							</li>
						);
					})}
				</ul>
			)}
			{sessions.isSuccess &&
				(others.length > 0 ? (
					<Button
						variant="outline"
						className="self-start"
						disabled={busy}
						onClick={() =>
							void run(
								() => authClient.revokeOtherSessions(),
								t("othersRevoked"),
							)
						}
					>
						{t("revokeOthers")}
					</Button>
				) : (
					<p className="text-muted-foreground text-xs">{t("onlyThis")}</p>
				))}
		</RecordSection>
	);
}

function Activity({ selfId }: { selfId?: string }) {
	const t = useTranslations("admin.account.activity");
	const tAudit = useTranslations("admin.audit");
	const locale = useLocale();
	const log = useQuery({
		...orpc.admin.auditLog.list.queryOptions({
			input: { limit: 10, actorId: selfId },
		}),
		enabled: Boolean(selfId),
	});
	const dateFormat = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});

	return (
		<RecordSection title={t("title")} className="xl:col-span-2">
			<p className="text-muted-foreground text-sm">{t("description")}</p>
			{log.isPending ? (
				<p className="text-muted-foreground text-sm">{t("loading")}</p>
			) : log.isError ? (
				<p className="text-destructive text-sm">{t("unavailable")}</p>
			) : log.data.items.length === 0 ? (
				<p className="text-muted-foreground text-sm">{t("empty")}</p>
			) : (
				<ul className="flex flex-col divide-y divide-border">
					{log.data.items.map((event) => {
						const key = auditActionMessageKey(event.action);
						return (
							<li
								key={event.id}
								className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
							>
								<span className="text-sm">
									{tAudit.has(key) ? tAudit(key) : event.action}
									{event.targetId && (
										<span className="ml-2 text-muted-foreground text-xs">
											{event.targetType}
										</span>
									)}
								</span>
								<span className="font-mono text-muted-foreground text-xs">
									{dateFormat.format(new Date(event.createdAt))}
								</span>
							</li>
						);
					})}
				</ul>
			)}
			<Button
				variant="link"
				size="sm"
				className="self-start px-0"
				render={<Link href="/admin/audit" />}
			>
				{t("full")}
			</Button>
		</RecordSection>
	);
}
