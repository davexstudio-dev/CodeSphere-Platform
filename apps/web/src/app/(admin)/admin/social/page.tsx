"use client";

import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@codesphere/ui/components/molecules/alert";
import { ConfirmTwoStep } from "@codesphere/ui/components/molecules/confirm-two-step";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@codesphere/ui/components/molecules/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircleIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Suspense, useState } from "react";

import AdminFrame from "@/components/admin-frame";
import { SocialPublishForm } from "@/components/social-publish-form";
import {
	accountState,
	connectErrorMessage,
	isExpired,
	publishablePlatforms,
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
	// Bluesky publishes from the deployment's secrets: nothing to connect, only to know (#324).
	const bluesky = status.data?.platforms.includes("bluesky") ?? false;
	const publishable = publishablePlatforms(
		status.data?.platforms ?? [],
		accounts,
	);
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
			{(accounts.length > 0 || bluesky) && (
				<div className="rounded-xl border bg-card">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("table.account")}</TableHead>
								<TableHead>{t("table.state")}</TableHead>
								<TableHead>{t("table.details")}</TableHead>
								<TableHead className="text-right">
									{t("table.actions")}
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{accounts.map((account) => {
								const state = accountState(account);
								const platform = account.platform as Platform;
								return (
									<TableRow key={platform}>
										<TableCell className="whitespace-normal">
											<span className="block font-medium">
												{t(`platforms.${platform}`)}
											</span>
											<span className="text-muted-foreground text-xs">
												{account.accountName ?? t(`hint.${state}`)}
											</span>
										</TableCell>
										<TableCell>
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
										</TableCell>
										<TableCell className="whitespace-normal text-xs">
											{state === "reconnect-required" && (
												<p className="text-destructive">
													{t("hint.reconnect-required")}
												</p>
											)}
											{account.connected && (
												<p>
													{t("expires")} :{" "}
													{account.expiresAt
														? dateFormat.format(new Date(account.expiresAt))
														: t("noExpiry")}
													{isExpired(account.expiresAt) &&
														state === "connected" &&
														` · ${t("renewsOnNextPost")}`}
												</p>
											)}
											{account.connectedAt && (
												<p className="text-muted-foreground">
													{t("connectedAt")} :{" "}
													{dateFormat.format(new Date(account.connectedAt))}
												</p>
											)}
										</TableCell>
										<TableCell>
											<div className="flex flex-wrap justify-end gap-2">
												{state !== "not-configured" && (
													<Button
														size="sm"
														variant={
															state === "connected" ? "outline" : "default"
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
														confirmLabel={(seconds) =>
															tc("confirm", { seconds })
														}
														cancelLabel={tc("cancel")}
														onConfirm={() => disconnect.mutate({ platform })}
													/>
												)}
											</div>
										</TableCell>
									</TableRow>
								);
							})}
							{bluesky && (
								<TableRow>
									<TableCell className="font-medium">
										{t("platforms.bluesky")}
									</TableCell>
									<TableCell>
										<Badge variant="secondary">{t("bySecret")}</Badge>
									</TableCell>
									<TableCell className="whitespace-normal text-muted-foreground text-xs">
										{t("bySecretHint")}
									</TableCell>
									<TableCell />
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			)}
			{publishable.length > 0 && <SocialPublishForm platforms={publishable} />}
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
