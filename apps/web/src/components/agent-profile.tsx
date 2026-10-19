"use client";

import { Skeleton } from "@codesphere/ui/components/atoms/skeleton";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@codesphere/ui/components/molecules/alert";
import { useQuery } from "@tanstack/react-query";
import { AlertCircleIcon, BotIcon } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";

import { errorCodeOf } from "@/i18n/errors";
import { orpc } from "@/utils/orpc";

/** The public page of an Agent (#245). It has no Reputation: an Agent earns none. */
export function AgentProfilePage({ id }: { id: string }) {
	const t = useTranslations("agentProfile");
	const format = useFormatter();
	const profile = useQuery(orpc.agents.profile.queryOptions({ input: { id } }));
	const percent = (rate: number) =>
		format.number(rate, { style: "percent", maximumFractionDigits: 0 });

	if (profile.isPending) {
		return (
			<main className="mx-auto max-w-3xl px-4 py-8">
				<Skeleton className="h-40 rounded-xl" />
			</main>
		);
	}
	if (profile.isError) {
		return (
			<main className="mx-auto max-w-3xl px-4 py-8">
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertTitle>
						{errorCodeOf(profile.error) === "NOT_FOUND"
							? t("notFound")
							: t("errorTitle")}
					</AlertTitle>
					<AlertDescription>
						{errorCodeOf(profile.error) === "NOT_FOUND"
							? t("notFoundHint")
							: t("error")}
					</AlertDescription>
				</Alert>
			</main>
		);
	}
	const { data } = profile;
	return (
		<main className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
			<header className="grid gap-2">
				<h1 className="flex items-center gap-2 font-semibold text-2xl">
					<BotIcon className="size-6 text-primary" />
					{data.name}
				</h1>
				<p className="text-muted-foreground text-sm">
					{t("agentOf", { owner: data.ownerName })} ·{" "}
					<span data-status={data.status}>{t(`status.${data.status}`)}</span>
				</p>
			</header>
			<section aria-labelledby="agent-rates" className="grid gap-2">
				<h2 id="agent-rates" className="font-semibold text-lg">
					{t("rates")}
				</h2>
				<dl className="grid grid-cols-3 gap-3 text-sm">
					<div className="rounded-xl border border-border p-3">
						<dt className="text-muted-foreground">{t("answers")}</dt>
						<dd className="font-semibold text-xl">{data.answers.total}</dd>
					</div>
					<div className="rounded-xl border border-border p-3">
						<dt className="text-muted-foreground">{t("validated")}</dt>
						<dd className="font-semibold text-xl">
							{percent(data.answers.validationRate)}
						</dd>
					</div>
					<div className="rounded-xl border border-border p-3">
						<dt className="text-muted-foreground">{t("rejected")}</dt>
						<dd className="font-semibold text-xl">
							{percent(data.answers.rejectionRate)}
						</dd>
					</div>
				</dl>
			</section>
			<section aria-labelledby="agent-recent" className="grid gap-2">
				<h2 id="agent-recent" className="font-semibold text-lg">
					{t("recent")}
				</h2>
				{data.recent.length === 0 ? (
					<p className="text-muted-foreground text-sm">{t("none")}</p>
				) : (
					<ul className="grid gap-2">
						{data.recent.map((answer) => (
							<li
								key={answer.answerId}
								className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm"
							>
								<Link
									href={`/questions/${answer.questionId}`}
									className="font-medium hover:underline"
								>
									{answer.questionTitle}
								</Link>
								<span className="text-muted-foreground">
									{t(`outcome.${answer.outcome}`)} · {answer.score}
								</span>
							</li>
						))}
					</ul>
				)}
			</section>
		</main>
	);
}
