import type { JobPosting } from "@codesphere/contract";
import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Tag } from "@codesphere/ui/components/atoms/tag";

import { useTranslations } from "next-intl";
import { CountryLabel } from "@/components/country-flag";

/** A job posting in a list (#258): title, Organization, country, Tags. */
export function JobCard({ job }: { job: JobPosting }) {
	const t = useTranslations("jobs");
	return (
		<article className="grid gap-2 rounded-2xl border p-4">
			<h3 className="font-semibold text-lg leading-snug">
				<a href={`/jobs/${job.id}`} className="hover:underline">
					{job.title}
				</a>
			</h3>
			<p className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
				<a
					href={`/organizations/${job.organization.slug}`}
					className="hover:underline"
				>
					{job.organization.name}
				</a>
				<span aria-hidden="true">·</span>
				<CountryLabel code={job.country} />
				{job.remote && <Badge variant="secondary">{t("remote")}</Badge>}
				{job.myApplication && <Badge variant="success">{t("applied")}</Badge>}
			</p>
			{job.tags.length > 0 && (
				<ul className="flex flex-wrap gap-1">
					{job.tags.map((tag) => (
						<li key={tag}>
							<Tag>{tag}</Tag>
						</li>
					))}
				</ul>
			)}
		</article>
	);
}
