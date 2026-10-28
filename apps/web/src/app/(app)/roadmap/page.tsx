import { MIN_MEMBERS_PER_COUNTRY } from "@codesphere/contract";
import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Card } from "@codesphere/ui/components/molecules/card";
import { RoadmapTimeline } from "@codesphere/ui/components/organisms/roadmap-timeline";
import { SectionNav } from "@codesphere/ui/components/organisms/section-nav";
import { StatStrip } from "@codesphere/ui/components/organisms/stat-strip";
import { LightbulbIcon, MinusCircleIcon } from "lucide-react";
import type { Metadata, Route } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { progressOf, roadmapIn } from "@/lib/roadmap";
import { client } from "@/utils/orpc";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("roadmap");
	return { title: `${t("title")} · CodeSphere`, description: t("intro") };
}

// Public roadmap (#252): server-rendered, readable without JavaScript. The capabilities come from
// docs/roadmap.yaml; the figures from the daily snapshot, so they are the same for every visitor.
export default async function Page() {
	const t = await getTranslations("roadmap");
	const locale = await getLocale();
	const format = await getFormatter();
	const roadmap = roadmapIn(locale);
	const overall = progressOf(
		roadmap.sections.flatMap((section) => section.items),
	);
	const snapshot = await client.community.snapshot().catch((error) => {
		// Not fatal for the page, but never silent: a broken snapshot must show in the logs.
		console.error("roadmap: community snapshot unavailable", error);
		return null;
	});

	const ideas = await client.questions
		.list({ tags: ["roadmap"], sort: "recent", limit: 5 })
		.then((page) => page.items)
		.catch(() => []);

	const duration = (minutes: number) =>
		minutes >= 120
			? t("hours", { count: Math.round(minutes / 60) })
			: t("minutes", { count: minutes });
	const percent = (share: number) =>
		format.number(share, { style: "percent", maximumFractionDigits: 0 });

	const figures = snapshot && [
		{
			label: t("activeMembers"),
			value: format.number(snapshot.activeMembers),
		},
		{ label: t("questions"), value: format.number(snapshot.questions) },
		{ label: t("answerRate"), value: percent(snapshot.answerRate) },
		{
			label: t("median"),
			value:
				snapshot.medianFirstAnswerMinutes === null
					? t("medianNone")
					: duration(snapshot.medianFirstAnswerMinutes),
		},
		{ label: t("acceptanceRate"), value: percent(snapshot.acceptanceRate) },
		{ label: t("countries"), value: format.number(snapshot.countries) },
	];

	const summary = [
		{ id: "community", label: t("community") },
		...roadmap.sections.map((section) => ({
			id: section.id,
			label: section.title,
			progress: {
				done: progressOf(section.items).delivered,
				total: section.items.length,
			},
		})),
		{ id: "not-doing", label: t("notDoing") },
		{ id: "ideas", label: t("ideas") },
	];

	return (
		<div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:px-8 md:py-14 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
			<aside className="lg:sticky lg:top-6 lg:self-start">
				<SectionNav title={t("summary")} items={summary} />
				<p className="mt-3 hidden text-muted-foreground text-xs lg:block">
					{t("remaining", { count: overall.inProgress + overall.planned })}
				</p>
			</aside>
			<main className="flex min-w-0 flex-col gap-12">
				<header className="flex flex-col gap-4">
					<Badge variant="outline" className="w-fit">
						{t("nav")}
					</Badge>
					<h1 className="font-semibold text-4xl tracking-tight md:text-5xl">
						{t("title")}
					</h1>
					<p className="max-w-2xl text-lg text-muted-foreground leading-relaxed">
						{t("intro")}
					</p>
					<div className="mt-2 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:p-5">
						<div className="flex flex-wrap items-baseline justify-between gap-2">
							<p className="font-medium text-sm">
								{t("overview", {
									done: overall.delivered,
									total: overall.total,
								})}
							</p>
							<p className="font-semibold text-2xl tabular-nums">
								{overall.percent} %
							</p>
						</div>
						<div
							role="progressbar"
							aria-label={t("overviewLabel")}
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={overall.percent}
							className="h-2 overflow-hidden rounded-full bg-muted"
						>
							<div
								className="h-full rounded-full bg-primary"
								style={{ width: `${overall.percent}%` }}
							/>
						</div>
						<ul className="flex flex-wrap gap-x-5 gap-y-1 text-muted-foreground text-xs">
							<li className="flex items-center gap-1.5">
								<span
									aria-hidden="true"
									className="size-2 rounded-full bg-emerald-500"
								/>
								{t("legendDelivered", { count: overall.delivered })}
							</li>
							<li className="flex items-center gap-1.5">
								<span
									aria-hidden="true"
									className="size-2 rounded-full bg-amber-500"
								/>
								{t("legendInProgress", { count: overall.inProgress })}
							</li>
							<li className="flex items-center gap-1.5">
								<span
									aria-hidden="true"
									className="size-2 rounded-full border border-border"
								/>
								{t("legendPlanned", { count: overall.planned })}
							</li>
						</ul>
					</div>
				</header>

				<section aria-labelledby="community" className="flex flex-col gap-4">
					<h2 id="community" className="scroll-mt-24 font-semibold text-xl">
						{t("community")}
					</h2>
					{figures && snapshot ? (
						<>
							<StatStrip items={figures} />
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

				{roadmap.sections.map((section) => {
					const progress = progressOf(section.items);
					return (
						<section
							key={section.id}
							aria-labelledby={section.id}
							className="flex flex-col gap-4"
						>
							<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
								<h2
									id={section.id}
									className="scroll-mt-24 font-semibold text-xl"
								>
									{section.title}
								</h2>
								<Badge variant="secondary" className="tabular-nums">
									{t("sectionProgress", {
										done: progress.delivered,
										total: progress.total,
									})}
								</Badge>
								{section.target && (
									<span className="text-muted-foreground text-sm">
										{t("target", { target: section.target })}
									</span>
								)}
							</div>
							<Card className="p-5 md:p-6">
								<RoadmapTimeline
									items={section.items.map((item) => ({
										id: item.text,
										text: item.text,
										status: item.status,
										statusLabel: t(`status.${item.status}`),
										reference: item.ref,
									}))}
								/>
							</Card>
						</section>
					);
				})}

				<section aria-labelledby="not-doing" className="flex flex-col gap-4">
					<h2 id="not-doing" className="scroll-mt-24 font-semibold text-xl">
						{t("notDoing")}
					</h2>
					<Card className="p-5 md:p-6">
						<ul className="flex flex-col gap-2.5">
							{roadmap.notDoing.map((text) => (
								<li key={text} className="flex items-start gap-2.5 text-sm">
									<MinusCircleIcon
										aria-hidden="true"
										className="mt-0.5 size-4 shrink-0 text-muted-foreground"
									/>
									<span>{text}</span>
								</li>
							))}
						</ul>
					</Card>
				</section>

				<section aria-labelledby="ideas">
					<Card className="gap-4 border-primary/20 bg-primary/5 p-5 ring-0 md:p-6">
						<div className="flex items-start gap-3">
							<LightbulbIcon
								aria-hidden="true"
								className="mt-1 size-5 shrink-0 text-primary"
							/>
							<div className="flex flex-col gap-1">
								<h2 id="ideas" className="scroll-mt-24 font-semibold text-xl">
									{t("ideas")}
								</h2>
								<p className="text-muted-foreground text-sm">
									{t("ideasHint")}
								</p>
							</div>
						</div>
						<div className="flex flex-col gap-1.5">
							<h3 className="font-medium text-sm">{t("ideasRecent")}</h3>
							{ideas.length === 0 ? (
								<p className="text-muted-foreground text-sm">
									{t("ideasNone")}
								</p>
							) : (
								<ul className="flex flex-col gap-1">
									{ideas.map((idea) => (
										<li key={idea.id} className="text-sm">
											<a
												href={`/questions/${idea.id}` as Route}
												className="hover:underline"
											>
												{idea.title}
											</a>
											<span className="text-muted-foreground text-xs">
												{" "}
												· {idea.score}
											</span>
										</li>
									))}
								</ul>
							)}
						</div>
						<a
							href={"/ask?tag=roadmap" as Route}
							className="w-fit rounded-full bg-primary px-4 py-2 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90"
						>
							{t("propose")}
						</a>
					</Card>
				</section>
			</main>
		</div>
	);
}
