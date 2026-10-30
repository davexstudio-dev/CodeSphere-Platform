"use client";

import { useDataSaver } from "@codesphere/ui/lib/data-saver";
import { cn } from "@codesphere/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { CountryLabel } from "@/components/country-flag";
import { authClient } from "@/lib/auth-client";
import { HAS_DATABASE } from "@/lib/deployment";
import { orpc } from "@/utils/orpc";

/** « Emplois qui correspondent à vos Tags » (#258): live postings on the Tags the Member follows. */
export function JobsModule() {
	const t = useTranslations("jobs.module");
	const { data: session } = authClient.useSession();
	// Only for a signed-in Member: the postings are those of the Tags they follow.
	const matching = useQuery({
		...orpc.jobs.matching.queryOptions({ input: { limit: 3 } }),
		enabled: HAS_DATABASE && Boolean(session),
	});
	const items = matching.data?.items ?? [];
	if (items.length === 0) {
		return null;
	}
	return (
		<section className="grid gap-3 rounded-2xl border border-border bg-card p-5">
			<p className="font-mono font-semibold text-2xs text-muted-foreground uppercase tracking-widest">
				{t("title")}
			</p>
			<ul className="grid gap-2">
				{items.map((job) => (
					<li key={job.id} className="grid text-sm">
						<a href={`/jobs/${job.id}`} className="font-medium hover:underline">
							{job.title}
						</a>
						<span className="text-muted-foreground text-xs">
							{job.organization.name} · {job.country}
						</span>
					</li>
				))}
			</ul>
			<a href="/jobs" className="text-sm underline">
				{t("all")}
			</a>
		</section>
	);
}

/** The latest live postings on a visitor's home (#323): `column` in the rail, `row` on a phone. */
export function LatestJobs({
	layout = "column",
}: {
	layout?: "column" | "row";
}) {
	const t = useTranslations("jobs.module");
	// A side block: data saver mode (#250) does not spend a request on it.
	const dataSaver = useDataSaver();
	const latest = useQuery({
		...orpc.jobs.list.queryOptions({ input: { limit: 4 } }),
		enabled: HAS_DATABASE && !dataSaver,
	});
	const items = latest.data?.items ?? [];
	if (items.length === 0) {
		return null;
	}
	return (
		<section className="grid min-w-0 gap-3 rounded-2xl border border-border bg-card p-5">
			<div className="flex items-baseline justify-between gap-2">
				<h2 className="font-semibold">{t("latest")}</h2>
				<a href="/jobs" className="text-sm underline underline-offset-4">
					{t("all")}
				</a>
			</div>
			<ul
				className={
					layout === "row"
						? "-mx-5 flex gap-3 overflow-x-auto px-5 pb-1"
						: "grid divide-y divide-border"
				}
			>
				{items.map((job) => (
					<li
						key={job.id}
						className={cn(
							"grid gap-0.5 text-sm",
							layout === "row"
								? "w-56 shrink-0 content-start rounded-xl border border-border p-3"
								: "py-3 first:pt-0 last:pb-0",
						)}
					>
						<a href={`/jobs/${job.id}`} className="font-medium hover:underline">
							{job.title}
						</a>
						<span className="flex flex-wrap items-center gap-1 text-muted-foreground text-xs">
							{job.organization.name} · <CountryLabel code={job.country} />
						</span>
					</li>
				))}
			</ul>
		</section>
	);
}
