"use client";

import type { Hackathon } from "@codesphere/contract";
import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Skeleton } from "@codesphere/ui/components/atoms/skeleton";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@codesphere/ui/components/molecules/alert";
import { Countdown } from "@codesphere/ui/components/molecules/countdown";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@codesphere/ui/components/molecules/tabs";
import { Timeline } from "@codesphere/ui/components/molecules/timeline";
import { useDataSaver } from "@codesphere/ui/lib/data-saver";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AlertCircleIcon, ExternalLinkIcon } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import type { z } from "zod";
import { FeedSkeleton, HomeFeed } from "@/components/home-feed";
import Link from "@/components/link";
import { ShareMenu } from "@/components/share-menu";
import { errorCodeOf } from "@/i18n/errors";
import { pageSizeFor } from "@/lib/data-saver";
import { HAS_DATABASE } from "@/lib/deployment";
import {
	HACKATHON_TABS,
	type HackathonTab,
	isHackathonTab,
	milestoneStates,
	sortedMilestones,
} from "@/lib/hackathon";
import { submissionClose } from "@/lib/home";
import { useMounted } from "@/lib/use-mounted";
import { orpc } from "@/utils/orpc";

type HackathonData = z.infer<typeof Hackathon>;

/** Dates in the reader's time zone, once in the browser only (no hydration mismatch). */
function useLocalDate() {
	const format = useFormatter();
	const mounted = useMounted();
	return (iso: string, withTime = true) =>
		mounted
			? format.dateTime(new Date(iso), {
					day: "numeric",
					month: "long",
					year: "numeric",
					...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
					timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				})
			: "…";
}

export function HackathonPage({ slug }: { slug: string }) {
	const t = useTranslations("hackathon");
	const hackathon = useQuery({
		...orpc.hackathons.get.queryOptions({ input: { slug } }),
		enabled: HAS_DATABASE,
		// An unknown slug stays unknown: show the not-found state at once.
		retry: (count, error) => errorCodeOf(error) !== "NOT_FOUND" && count < 3,
		// The page renders its own error state: no toast on top of it.
		meta: { silent: true },
	});
	// The server never has the persisted cache: render as it did until mounted (no hydration mismatch).
	const mounted = useMounted();

	if (!HAS_DATABASE) {
		return <Shell>{t("unavailable")}</Shell>;
	}
	if (!mounted || hackathon.isPending) {
		return (
			<Shell>
				<Skeleton className="h-48 rounded-3xl" />
				<Skeleton className="h-96 rounded-3xl" />
			</Shell>
		);
	}
	if (hackathon.isError) {
		const missing = errorCodeOf(hackathon.error) === "NOT_FOUND";
		return (
			<Shell>
				<Alert variant={missing ? "default" : "destructive"}>
					<AlertCircleIcon />
					<AlertTitle>{missing ? t("notFound") : t("error")}</AlertTitle>
					{!missing && (
						<AlertDescription>
							<Button
								variant="link"
								size="sm"
								onClick={() => hackathon.refetch()}
							>
								{t("retry")}
							</Button>
						</AlertDescription>
					)}
				</Alert>
			</Shell>
		);
	}
	return <HackathonView hackathon={hackathon.data} />;
}

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<main className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 md:px-6 md:py-8">
			{children}
		</main>
	);
}

function HackathonView({ hackathon }: { hackathon: HackathonData }) {
	const t = useTranslations("hackathon");
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const requested = searchParams.get("tab");
	const tab: HackathonTab = isHackathonTab(requested) ? requested : "overview";
	const setTab = (next: HackathonTab) =>
		router.replace(`${pathname}?tab=${next}` as Route, { scroll: false });

	return (
		<Shell>
			<Header hackathon={hackathon} />
			<Tabs
				value={tab}
				onValueChange={(value) => isHackathonTab(value) && setTab(value)}
			>
				{/* On a phone, the six tabs sit in two rows of three: all visible, none hidden off screen. */}
				<TabsList className="grid w-full grid-cols-3 rounded-2xl md:inline-flex md:w-fit md:rounded-full">
					{HACKATHON_TABS.map((key) => (
						<TabsTrigger
							key={key}
							value={key}
							className="rounded-xl px-2 md:rounded-full md:px-4"
						>
							{t(`tabs.${key}`)}
						</TabsTrigger>
					))}
				</TabsList>
				<TabsContent value="overview" className="pt-4">
					<Overview hackathon={hackathon} />
				</TabsContent>
				<TabsContent value="timeline" className="pt-4">
					<TimelineTab hackathon={hackathon} />
				</TabsContent>
				<TabsContent value="prizes" className="pt-4">
					<Prizes hackathon={hackathon} />
				</TabsContent>
				<TabsContent value="rules" className="pt-4">
					<Rules hackathon={hackathon} />
				</TabsContent>
				<TabsContent value="judging" className="pt-4">
					<Judging hackathon={hackathon} />
				</TabsContent>
				<TabsContent value="discussion" className="pt-4">
					{tab === "discussion" && <Discussion slug={hackathon.slug} />}
				</TabsContent>
			</Tabs>
		</Shell>
	);
}

function Header({ hackathon }: { hackathon: HackathonData }) {
	const t = useTranslations("hackathon");
	const date = useLocalDate();
	const closesAt = submissionClose(hackathon.milestones);
	const closed = closesAt ? Date.parse(closesAt) <= Date.now() : true;
	return (
		<header className="grid gap-5 rounded-3xl border border-border bg-card p-5 md:grid-cols-[1fr_auto] md:items-end md:p-8">
			<div className="grid gap-2">
				<p className="text-muted-foreground text-sm">
					{t("organizedBy", { organizer: hackathon.organizer })}
				</p>
				<h1 className="font-bold text-3xl tracking-tight md:text-4xl">
					{hackathon.name}
				</h1>
				<p className="max-w-2xl text-muted-foreground">{hackathon.summary}</p>
				<div className="mt-2 flex flex-wrap items-center gap-2">
					<Button
						render={
							<Link
								href={`/ask?tag=${encodeURIComponent(hackathon.slug)}` as Route}
							/>
						}
						nativeButton={false}
					>
						{t("ask")}
					</Button>
					<ShareMenu title={hackathon.name} />
				</div>
			</div>
			{closesAt && (
				<div className="grid gap-2">
					{closed ? (
						<p className="font-medium">{t("closed")}</p>
					) : (
						<>
							<p className="font-medium text-sm">{t("closesIn")}</p>
							<Countdown
								target={closesAt}
								labels={{
									days: t("countdown.days"),
									hours: t("countdown.hours"),
									minutes: t("countdown.minutes"),
									seconds: t("countdown.seconds"),
									idle: t("countdown.idle"),
									finished: t("countdown.finished"),
									remaining: (parts) => t("countdown.remaining", parts),
								}}
							/>
						</>
					)}
					<p className="text-muted-foreground text-xs">
						{t("closesAt", { date: date(closesAt) })}
					</p>
				</div>
			)}
		</header>
	);
}

function Overview({ hackathon }: { hackathon: HackathonData }) {
	const t = useTranslations("hackathon");
	const date = useLocalDate();
	const milestones = sortedMilestones(hackathon.milestones);
	const states = milestoneStates(milestones, new Date());
	const next = milestones[states.indexOf("current")];
	return (
		<div className="grid gap-4 md:grid-cols-2">
			<section className="grid gap-1 rounded-2xl border border-border p-5">
				<h2 className="font-medium text-muted-foreground text-sm">
					{t("overview.next")}
				</h2>
				{next ? (
					<>
						<p className="font-semibold text-lg">{next.label}</p>
						<p className="text-muted-foreground text-sm">
							{date(next.startsAt)}
						</p>
					</>
				) : (
					<p className="text-muted-foreground">{t("overview.noMilestone")}</p>
				)}
			</section>
			<section className="grid gap-1 rounded-2xl border border-border p-5">
				<h2 className="font-medium text-muted-foreground text-sm">
					{t("overview.team")}
				</h2>
				<p className="font-semibold text-lg">
					{t("overview.teamSize", {
						min: hackathon.teamMin,
						max: hackathon.teamMax,
					})}
				</p>
			</section>
		</div>
	);
}

function TimelineTab({ hackathon }: { hackathon: HackathonData }) {
	const t = useTranslations("hackathon");
	const date = useLocalDate();
	const milestones = sortedMilestones(hackathon.milestones);
	const states = milestoneStates(milestones, new Date());
	return (
		<section className="grid gap-4">
			<h2 className="font-semibold text-xl">{t("timeline.title")}</h2>
			<Timeline
				items={milestones.map((m, i) => ({
					date: date(m.startsAt),
					title: m.label,
					description: m.endsAt
						? t("timeline.until", { date: date(m.endsAt) })
						: undefined,
					state: states[i] ?? "upcoming",
				}))}
			/>
		</section>
	);
}

function Prizes({ hackathon }: { hackathon: HackathonData }) {
	const t = useTranslations("hackathon");
	if (hackathon.prizes.length === 0) {
		return <p className="text-muted-foreground">{t("prizes.none")}</p>;
	}
	return (
		<section className="grid gap-4">
			<h2 className="font-semibold text-xl">{t("prizes.title")}</h2>
			<ul className="grid gap-3 md:grid-cols-2">
				{hackathon.prizes.map((prize) => (
					<li
						key={prize.label}
						className="grid gap-1 rounded-2xl border border-border p-5"
					>
						<p className="font-semibold">{prize.label}</p>
						{prize.amount && (
							<p className="font-bold text-2xl text-primary">{prize.amount}</p>
						)}
						{prize.conditions && (
							<p className="text-muted-foreground text-sm">
								{t("prizes.conditions", { conditions: prize.conditions })}
							</p>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}

function Rules({ hackathon }: { hackathon: HackathonData }) {
	const t = useTranslations("hackathon");
	const date = useLocalDate();
	return (
		<section className="grid gap-3">
			<h2 className="font-semibold text-xl">{t("rules.title")}</h2>
			<p>
				{t("rules.team", { min: hackathon.teamMin, max: hackathon.teamMax })}
			</p>
			<p>
				<a
					href={hackathon.sourceUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
				>
					{t("rules.source")}
					<ExternalLinkIcon className="size-3.5" aria-hidden />
				</a>
			</p>
			<p className="text-muted-foreground text-sm">
				{t("rules.verified", { date: date(hackathon.verifiedAt, false) })}
			</p>
			{hackathon.sourceNote && (
				<p className="text-muted-foreground text-sm">
					{t("rules.note", { note: hackathon.sourceNote })}
				</p>
			)}
		</section>
	);
}

function Judging({ hackathon }: { hackathon: HackathonData }) {
	const t = useTranslations("hackathon");
	if (hackathon.criteria.length === 0) {
		return <p className="text-muted-foreground">{t("judging.none")}</p>;
	}
	return (
		<section className="grid gap-4">
			<h2 className="font-semibold text-xl">{t("judging.title")}</h2>
			<ul className="grid gap-3">
				{hackathon.criteria.map((criterion) => (
					<li key={criterion.label} className="grid gap-2">
						<div className="flex items-center justify-between gap-3">
							<span className="font-medium">{criterion.label}</span>
							<span className="flex items-center gap-2">
								<Badge variant="outline">
									{t(`judging.scoredBy.${criterion.scoredBy}`)}
								</Badge>
								<span className="font-mono text-sm tabular-nums">
									{criterion.weight} %
								</span>
							</span>
						</div>
						<div
							className="h-2 overflow-hidden rounded-full bg-muted"
							role="presentation"
						>
							<div
								className="h-full rounded-full bg-primary"
								style={{ width: `${criterion.weight}%` }}
							/>
						</div>
					</li>
				))}
			</ul>
		</section>
	);
}

function Discussion({ slug }: { slug: string }) {
	const t = useTranslations("hackathon.discussion");
	const mounted = useMounted();
	const pageSize = pageSizeFor(20, useDataSaver());
	const questions = useInfiniteQuery(
		orpc.questions.list.infiniteOptions({
			input: (cursor: string | undefined) => ({
				cursor,
				limit: pageSize,
				tags: [slug],
				sort: "recent" as const,
			}),
			initialPageParam: undefined,
			getNextPageParam: (last) => last.nextCursor ?? undefined,
		}),
	);
	const items = (questions.data?.pages ?? []).flatMap((page) => page.items);
	return (
		<section className="grid gap-4">
			<div className="grid gap-1">
				<h2 className="font-semibold text-xl">{t("title")}</h2>
				<p className="text-muted-foreground text-sm">
					{t("lead", { tag: slug })}
				</p>
			</div>
			{!mounted || questions.isPending ? (
				<FeedSkeleton />
			) : items.length === 0 ? (
				<p className="text-muted-foreground">{t("empty")}</p>
			) : (
				<HomeFeed
					items={items.map((question) => ({
						kind: "question" as const,
						question,
						reasons: [],
						sourceKey: null,
						sourceName: null,
					}))}
					hasNextPage={questions.hasNextPage}
					isFetchingNextPage={questions.isFetchingNextPage}
					fetchNextPage={questions.fetchNextPage}
				/>
			)}
		</section>
	);
}
