"use client";

import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Skeleton } from "@codesphere/ui/components/atoms/skeleton";
import { Tag } from "@codesphere/ui/components/atoms/tag";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import SsoLoginDialog from "@/components/sso-login-dialog";
import { errorCodeOf } from "@/i18n/errors";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

/** A job posting (#258): how to apply, « Postuler avec ma fiche CodeSphere », report, and for its owner the applicants. */
export function JobDetail({ id }: { id: string }) {
	const t = useTranslations("jobs");
	const format = useFormatter();
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();
	const [signingIn, setSigningIn] = useState(false);
	const [reporting, setReporting] = useState(false);
	const [reason, setReason] = useState("");
	const job = useQuery(orpc.jobs.get.queryOptions({ input: { id } }));
	const mine = useQuery({
		...orpc.jobs.mine.queryOptions({ input: {} }),
		enabled: Boolean(session),
	});
	const owned = mine.data?.items.find((j) => j.id === id);
	const applicants = useQuery({
		...orpc.jobs.applicants.queryOptions({ input: { id } }),
		enabled: Boolean(owned),
	});
	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey: orpc.jobs.key() });
	};
	const failed = (error: unknown) =>
		toast.error(
			errorCodeOf(error) === "FORBIDDEN"
				? t("errors.forbidden")
				: t("errors.generic"),
		);
	const applyTo = useMutation(
		orpc.jobs.applyTo.mutationOptions({
			onSuccess: () => {
				toast.success(t("appliedToast"));
				refresh();
			},
			onError: failed,
		}),
	);
	const report = useMutation(
		orpc.jobs.report.mutationOptions({
			onSuccess: () => {
				toast.success(t("reported"));
				setReporting(false);
				setReason("");
			},
			onError: failed,
		}),
	);
	const close = useMutation(
		orpc.jobs.close.mutationOptions({ onSuccess: refresh, onError: failed }),
	);

	if (job.isPending) {
		return (
			<main className="mx-auto max-w-3xl px-4 py-8">
				<Skeleton className="h-64 rounded-2xl" />
			</main>
		);
	}
	if (job.isError || !job.data) {
		return (
			<main className="mx-auto max-w-3xl px-4 py-8">
				<p className="text-muted-foreground">
					{errorCodeOf(job.error) === "NOT_FOUND" ? t("notFound") : t("error")}
				</p>
			</main>
		);
	}
	const data = job.data;
	const apply = (shareCard: boolean) =>
		session ? applyTo.mutate({ id, shareCard }) : setSigningIn(true);

	return (
		<main className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
			<header className="grid gap-2">
				<h1 className="font-semibold text-3xl">{data.title}</h1>
				<p className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
					<a
						href={`/organizations/${data.organization.slug}`}
						className="hover:underline"
					>
						{data.organization.name}
					</a>
					<span aria-hidden="true">·</span>
					<span>{data.country}</span>
					{data.remote && <Badge variant="secondary">{t("remote")}</Badge>}
					<span>
						{t("expires", {
							date: format.dateTime(new Date(data.expiresAt), {
								dateStyle: "long",
							}),
						})}
					</span>
				</p>
				<ul className="flex flex-wrap gap-1">
					{data.tags.map((tag) => (
						<li key={tag}>
							<Tag>{tag}</Tag>
						</li>
					))}
				</ul>
			</header>
			<p className="whitespace-pre-wrap">{data.description}</p>

			<section
				aria-labelledby="apply"
				className="grid gap-3 rounded-2xl border p-4"
			>
				<h2 id="apply" className="font-semibold text-lg">
					{t("howToApply")}
				</h2>
				<p className="text-muted-foreground text-sm">{t("free")}</p>
				{data.applyUrl && (
					<a
						href={data.applyUrl}
						target="_blank"
						rel="noopener noreferrer nofollow"
						className="w-fit font-medium underline"
					>
						{t("applyLink")}
					</a>
				)}
				{data.applyEmail && (
					<a
						href={`mailto:${data.applyEmail}`}
						className="w-fit font-medium underline"
					>
						{data.applyEmail}
					</a>
				)}
				{data.myApplication ? (
					<div className="flex flex-wrap items-center gap-3">
						<p className="text-sm">
							{data.myApplication.sharedCard
								? t("appliedShared")
								: t("appliedPlain")}
						</p>
						{data.myApplication.sharedCard && (
							<Button
								size="sm"
								variant="outline"
								disabled={applyTo.isPending}
								onClick={() => apply(false)}
							>
								{t("stopSharing")}
							</Button>
						)}
					</div>
				) : (
					<div className="flex flex-wrap gap-2">
						<Button disabled={applyTo.isPending} onClick={() => apply(true)}>
							{t("applyWithCard")}
						</Button>
						<Button
							variant="outline"
							disabled={applyTo.isPending}
							onClick={() => apply(false)}
						>
							{t("applyWithoutCard")}
						</Button>
					</div>
				)}
				<p className="text-muted-foreground text-xs">{t("applyHint")}</p>
			</section>

			<div className="flex flex-wrap items-center gap-2">
				<Button
					size="sm"
					variant="ghost"
					onClick={() =>
						session ? setReporting((o) => !o) : setSigningIn(true)
					}
				>
					{t("report")}
				</Button>
			</div>
			{reporting && (
				<form
					className="flex flex-wrap gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						report.mutate({ id, reason });
					}}
				>
					<Input
						required
						minLength={3}
						maxLength={300}
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						aria-label={t("reportReason")}
						placeholder={t("reportReason")}
						className="min-w-0 flex-1"
					/>
					<Button type="submit" size="sm" disabled={report.isPending}>
						{t("reportSend")}
					</Button>
				</form>
			)}

			{owned && (
				<section
					aria-labelledby="applicants"
					className="grid gap-3 rounded-2xl border p-4"
				>
					<div className="flex items-center justify-between gap-2">
						<h2 id="applicants" className="font-semibold text-lg">
							{t("applicants")}
						</h2>
						<Button
							size="sm"
							variant="destructive"
							disabled={close.isPending}
							onClick={() =>
								window.confirm(t("confirmClose")) && close.mutate({ id })
							}
						>
							{t("close")}
						</Button>
					</div>
					{(applicants.data?.items.length ?? 0) === 0 ? (
						<p className="text-muted-foreground text-sm">{t("noApplicants")}</p>
					) : (
						<ul className="grid gap-2">
							{applicants.data?.items.map((a) => (
								<li
									key={`${a.name}-${a.appliedAt}`}
									className="grid gap-1 rounded-xl border p-3 text-sm"
								>
									<span className="font-medium">{a.name}</span>
									{a.card ? (
										<>
											<span className="text-muted-foreground">
												{t("reputation", { count: a.card.reputation })}
												{a.card.country ? ` · ${a.card.country}` : ""}
												{a.card.strongestTags.length > 0
													? ` · ${a.card.strongestTags.join(", ")}`
													: ""}
											</span>
											{a.card.headline && <span>{a.card.headline}</span>}
											{a.card.codeUrl && (
												<a
													href={a.card.codeUrl}
													target="_blank"
													rel="noopener noreferrer nofollow"
													className="underline"
												>
													{a.card.codeUrl}
												</a>
											)}
											{a.card.contactEmail && (
												<a
													href={`mailto:${a.card.contactEmail}`}
													className="underline"
												>
													{a.card.contactEmail}
												</a>
											)}
										</>
									) : (
										<span className="text-muted-foreground">{t("noCard")}</span>
									)}
								</li>
							))}
						</ul>
					)}
				</section>
			)}
			<SsoLoginDialog open={signingIn} onOpenChange={setSigningIn} />
		</main>
	);
}
