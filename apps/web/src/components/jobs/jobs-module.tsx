"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { HAS_DATABASE } from "@/lib/deployment";
import { orpc } from "@/utils/orpc";

/** « Emplois qui correspondent à vos Tags » (#258): live postings on the Tags the Member follows. */
export function JobsModule() {
	const t = useTranslations("jobs.module");
	const matching = useQuery({
		...orpc.jobs.matching.queryOptions({ input: { limit: 3 } }),
		enabled: HAS_DATABASE,
	});
	const items = matching.data?.items ?? [];
	if (items.length === 0) {
		return null;
	}
	return (
		<section className="grid gap-3 rounded-2xl border border-border bg-card p-5">
			<p className="font-mono font-semibold text-[0.68rem] text-muted-foreground uppercase tracking-widest">
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
