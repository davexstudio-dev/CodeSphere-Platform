import { MIN_MEMBERS_PER_COUNTRY } from "@codesphere/contract";
import type { Metadata, Route } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { type RoadmapStatus, roadmapIn } from "@/lib/roadmap";
import { client } from "@/utils/orpc";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("roadmap");
	return { title: `${t("title")} · CodeSphere`, description: t("intro") };
}

const BADGE: Record<RoadmapStatus, string> = {
	delivered: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
	in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
	planned: "bg-muted text-muted-foreground",
};

// Public roadmap (#252): server-rendered, readable without JavaScript. The capabilities come from
// docs/roadmap.yaml; the figures from the daily snapshot, so they are the same for every visitor.
export default async function Page() {
	const t = await getTranslations("roadmap");
	const locale = await getLocale();
	const format = await getFormatter();
	const roadmap = roadmapIn(locale);
	const snapshot = await client.community.snapshot().catch(() => null);

	const duration = (minutes: number) =>
		minutes >= 120
			? t("hours", { count: Math.round(minutes / 60) })
			: t("minutes", { count: minutes });
	const percent = (share: number) =>
		format.number(share, { style: "percent", maximumFractionDigits: 0 });

	const figures = snapshot && [
		[t("activeMembers"), format.number(snapshot.activeMembers)],
		[t("questions"), format.number(snapshot.questions)],
		[t("answerRate"), percent(snapshot.answerRate)],
		[
			t("median"),
			snapshot.medianFirstAnswerMinutes === null
				? t("medianNone")
				: duration(snapshot.medianFirstAnswerMinutes),
		],
		[t("acceptanceRate"), percent(snapshot.acceptanceRate)],
		[t("countries"), format.number(snapshot.countries)],
	];

	return (
		<main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-10 md:px-8">
			<header className="flex flex-col gap-2">
				<h1 className="font-semibold text-3xl">{t("title")}</h1>
				<p className="text-muted-foreground">{t("intro")}</p>
			</header>

			<section aria-labelledby="community" className="flex flex-col gap-4">
				<h2 id="community" className="font-semibold text-xl">
					{t("community")}
				</h2>
				{figures && snapshot ? (
					<>
						<dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
							{figures.map(([label, value]) => (
								<div key={label} className="rounded-2xl border p-4">
									<dt className="text-muted-foreground text-sm">{label}</dt>
									<dd className="font-semibold text-2xl">{value}</dd>
								</div>
							))}
						</dl>
						<p className="text-muted-foreground text-xs">
							{t("snapshot", {
								date: format.dateTime(new Date(`${snapshot.day}T00:00:00Z`), {
									dateStyle: "long",
									timeZone: "UTC",
								}),
							})}{" "}
							{t("countriesNote", { min: MIN_MEMBERS_PER_COUNTRY })}
						</p>
					</>
				) : (
					<p className="text-muted-foreground">{t("unavailable")}</p>
				)}
			</section>

			{roadmap.sections.map((section) => (
				<section
					key={section.id}
					aria-labelledby={section.id}
					className="flex flex-col gap-3"
				>
					<h2 id={section.id} className="font-semibold text-xl">
						{section.title}
					</h2>
					{section.target && (
						<p className="text-muted-foreground text-sm">
							{t("target", { target: section.target })}
						</p>
					)}
					<ul className="flex flex-col gap-2">
						{section.items.map((item) => (
							<li
								key={item.text}
								className="flex flex-wrap items-start gap-2 rounded-xl border p-3"
							>
								<span
									className={`shrink-0 rounded-full px-2 py-0.5 font-medium text-xs ${BADGE[item.status]}`}
								>
									{t(`status.${item.status}`)}
								</span>
								<span className="min-w-0 flex-1">{item.text}</span>
								{item.ref && (
									<span className="text-muted-foreground text-xs">
										{item.ref}
									</span>
								)}
							</li>
						))}
					</ul>
				</section>
			))}

			<section aria-labelledby="not-doing" className="flex flex-col gap-3">
				<h2 id="not-doing" className="font-semibold text-xl">
					{t("notDoing")}
				</h2>
				<ul className="list-disc pl-5">
					{roadmap.notDoing.map((text) => (
						<li key={text}>{text}</li>
					))}
				</ul>
			</section>

			<section aria-labelledby="ideas" className="flex flex-col gap-2">
				<h2 id="ideas" className="font-semibold text-xl">
					{t("ideas")}
				</h2>
				<p className="text-muted-foreground">{t("ideasHint")}</p>
				<a
					href={"/ask?tag=roadmap" as Route}
					className="w-fit rounded-full bg-primary px-4 py-2 font-medium text-primary-foreground text-sm"
				>
					{t("propose")}
				</a>
			</section>
		</main>
	);
}
