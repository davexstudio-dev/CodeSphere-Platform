"use client";

import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@codesphere/ui/components/molecules/alert";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@codesphere/ui/components/molecules/card";
import { ConfirmTwoStep } from "@codesphere/ui/components/molecules/confirm-two-step";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircleIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Suspense, useState } from "react";

import AdminFrame from "@/components/admin-frame";
import {
	accountState,
	connectErrorMessage,
	isExpired,
} from "@/lib/admin-social";
import { orpc } from "@/utils/orpc";

type Platform = "x" | "linkedin";

function SocialAccounts() {
	const t = useTranslations("admin.social");
	const tc = useTranslations("admin.common");
	const locale = useLocale();
	const queryClient = useQueryClient();
	const connectedNow = useSearchParams().get("connected");
	const [error, setError] = useState<string | null>(null);
	const status = useQuery(orpc.admin.social.status.queryOptions({ input: {} }));
	const dateFormat = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});

	const connect = useMutation(
		orpc.admin.social.connect.mutationOptions({
			onSuccess: ({ authorizationUrl }) => {
				window.location.assign(authorizationUrl);
			},
			onError: (failure) => setError(connectErrorMessage(failure, t("error"))),
		}),
	);
	const disconnect = useMutation(
		orpc.admin.social.disconnect.mutationOptions({
			onSuccess: () => {
				setError(null);
				void queryClient.invalidateQueries({
					queryKey: orpc.admin.social.key(),
				});
			},
			onError: (failure) => setError(connectErrorMessage(failure, t("error"))),
		}),
	);

	const accounts = status.data?.accounts ?? [];
	return (
		<AdminFrame title={t("title")} description={t("description")}>
			{status.isError && (
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertTitle>{t("unavailable")}</AlertTitle>
					<AlertDescription>
						<Button variant="link" size="sm" onClick={() => status.refetch()}>
							{t("retry")}
						</Button>
					</AlertDescription>
				</Alert>
			)}
			{connectedNow && (
				<Alert>
					<AlertTitle>
						{t("connectedNow", { platform: t(`platforms.${connectedNow}`) })}
					</AlertTitle>
				</Alert>
			)}
			{error && (
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertTitle>{error}</AlertTitle>
				</Alert>
			)}
			{status.isSuccess && accounts.length === 0 && (
				<p className="text-muted-foreground text-sm">{t("notSetUp")}</p>
			)}
			<div className="grid gap-4 md:grid-cols-2">
				{accounts.map((account) => {
					const state = accountState(account);
					const platform = account.platform as Platform;
					return (
						<Card key={platform}>
							<CardHeader>
								<CardTitle>
									<span className="flex items-center gap-2">
										{t(`platforms.${platform}`)}
										<Badge
											variant={
												state === "reconnect-required"
													? "destructive"
													: state === "connected"
														? "default"
														: "secondary"
											}
										>
											{t(`state.${state}`)}
										</Badge>
									</span>
								</CardTitle>
								<CardDescription>
									{account.accountName ?? t(`hint.${state}`)}
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-3">
								{account.connected && (
									<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
										<dt className="text-muted-foreground">{t("expires")}</dt>
										<dd>
											{account.expiresAt
												? dateFormat.format(new Date(account.expiresAt))
												: t("noExpiry")}
											{isExpired(account.expiresAt) &&
												state === "connected" &&
												` · ${t("renewsOnNextPost")}`}
										</dd>
										{account.connectedAt && (
											<>
												<dt className="text-muted-foreground">
													{t("connectedAt")}
												</dt>
												<dd>
													{dateFormat.format(new Date(account.connectedAt))}
												</dd>
											</>
										)}
									</dl>
								)}
								{state === "reconnect-required" && (
									<p className="text-destructive text-sm">
										{t("hint.reconnect-required")}
									</p>
								)}
								<div className="flex flex-wrap gap-2">
									{state !== "not-configured" && (
										<Button
											variant={
												state === "reconnect-required" ? "default" : "outline"
											}
											disabled={connect.isPending}
											onClick={() => {
												setError(null);
												connect.mutate({ platform });
											}}
										>
											{account.connected ? t("reconnect") : t("connect")}
										</Button>
									)}
									{account.connected && (
										<ConfirmTwoStep
											label={t("disconnect")}
											confirmLabel={(seconds) => tc("confirm", { seconds })}
											cancelLabel={tc("cancel")}
											onConfirm={() => disconnect.mutate({ platform })}
										/>
									)}
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>
		</AdminFrame>
	);
}

export default function AdminSocialPage() {
	return (
		<Suspense fallback={null}>
			<SocialAccounts />
		</Suspense>
	);
}
