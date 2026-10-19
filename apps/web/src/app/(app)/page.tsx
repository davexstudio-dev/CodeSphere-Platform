"use client";

import type { Hackathon } from "@codesphere/contract";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Skeleton } from "@codesphere/ui/components/atoms/skeleton";
import { CadevBanner } from "@codesphere/ui/components/molecules/cadev-banner";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@codesphere/ui/components/molecules/empty";
import { FollowedTags } from "@codesphere/ui/components/molecules/followed-tags";
import { SegmentedControl } from "@codesphere/ui/components/molecules/segmented-control";
import { FeedFilters } from "@codesphere/ui/components/organisms/feed-filters";
import { useQuery } from "@tanstack/react-query";
import { CheckIcon, MessageSquareIcon, TagIcon } from "lucide-react";
import type { Route } from "next";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type * as z from "zod";
import { FeedSkeleton, HomeFeed, useFeed } from "@/components/home-feed";
import { JobsModule } from "@/components/jobs/jobs-module";
import Link from "@/components/link";
import { AskButton } from "@/components/site-header";
import TagsOnboardingRedirect from "@/components/tags-onboarding-redirect";
import { HAS_DATABASE } from "@/lib/deployment";
import { firstName, greetingKey, submissionClose } from "@/lib/home";
import { gettingStarted } from "@/lib/tags-onboarding";
import { useHydratedSession } from "@/lib/use-hydrated-session";
import { useMounted } from "@/lib/use-mounted";
import { orpc } from "@/utils/orpc";

type HackathonData = z.infer<typeof Hackathon>;

// Home (#130, design from the home prototype): desktop visitor = one centred column with the
// banner; desktop Member = feed and a sticky rail; phone = promise for a visitor, greeting and a
// compact ribbon for a Member. The feed (#66): three tabs, language and country filters, cards
// leading to the Question page, Agents' Questions dashed and hidden on request.
export default function Home() {
	const { data: session, isPending } = useHydratedSession();
	// Without a database the banner is simply absent.
	const hackathon = useQuery({
		...orpc.hackathons.get.queryOptions({ input: { slug: "cadev-2026" } }),
		enabled: HAS_DATABASE,
	});
	if (isPending) {
		return <PageSkeleton />;
	}
	return session ? (
		<MemberHome name={session.user.name} hackathon={hackathon.data} />
	) : (
		<VisitorHome hackathon={hackathon.data} />
	);
}

function useBannerLabels() {
	const t = useTranslations("home.banner");
	return {
		eyebrow: t("eyebrow"),
		days: t("days"),
		daysShort: t("daysShort"),
		hours: t("hours"),
		remaining: (days: number) => t("remaining", { days }),
		timeline: t("timeline"),
	};
}

function Banner({
	hackathon,
	variant = "card",
	className,
}: {
	hackathon: HackathonData | undefined;
	variant?: "card" | "ribbon" | "rail";
	className?: string;
}) {
	const t = useTranslations("home.banner");
	const labels = useBannerLabels();
	const format = useFormatter();
	const locale = useLocale();
	const mounted = useMounted();
	if (!hackathon) {
		return (
			<Skeleton
				className={
					variant === "ribbon" ? "h-16 rounded-xl" : "h-56 rounded-3xl"
				}
			/>
		);
	}
	const closesAt = submissionClose(hackathon.milestones);
	if (!closesAt) {
		return null;
	}
	// The viewer's timezone and the app's locale, once in the browser only (no hydration mismatch).
	const date = mounted
		? format.dateTime(new Date(closesAt), {
				day: "numeric",
				month: "long",
				hour: "numeric",
				minute: "2-digit",
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			})
		: "…";
	const see = (
		<Button
			variant={variant === "rail" ? "outline" : "secondary"}
			size="sm"
			render={<Link href={`/hackathons/${hackathon.slug}` as Route} />}
			nativeButton={false}
		>
			{t("see")}
		</Button>
	);
	return (
		<CadevBanner
			className={className}
			variant={variant}
			locale={locale}
			name={hackathon.name}
			summary={hackathon.summary}
			closesAt={closesAt}
			milestones={hackathon.milestones}
			labels={{ ...labels, closes: t("closes", { date }) }}
			action={variant === "ribbon" ? undefined : see}
		/>
	);
}

const TABS = ["forYou", "recent", "unanswered"] as const;

/** Countries offered by the filter: the most represented first, then the diaspora. */
const FEED_COUNTRIES = [
	"SN",
	"CI",
	"BF",
	"ML",
	"BJ",
	"TG",
	"CM",
	"NG",
	"GH",
	"KE",
	"MA",
	"OTHER",
] as const;
type TabKey = (typeof TABS)[number];

function FeedSection({ signedIn }: { signedIn: boolean }) {
	const t = useTranslations("home.tabs");
	const tFilters = useTranslations("home.filters");
	// Keyed by id, not by label: switching language keeps the selected tab.
	const [tab, setTab] = useState<TabKey>(signedIn ? "forYou" : "recent");
	const [language, setLanguage] = useState("all");
	const [country, setCountry] = useState("all");
	const me = useQuery({
		...orpc.members.me.queryOptions(),
		enabled: HAS_DATABASE && signedIn,
	});
	const labels = TABS.map((key) => t(key));
	// The server never has the persisted cache: the skeleton until mounted (no hydration mismatch).
	const mounted = useMounted();
	const feed = useFeed(tab, signedIn, {
		language,
		country,
		hideAgents: me.data?.hideAgentContent ?? false,
	});
	return (
		<div className="grid gap-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<SegmentedControl
					options={labels}
					value={t(tab)}
					onValueChange={(label) => setTab(TABS[labels.indexOf(label)] ?? tab)}
				/>
				<FeedFilters
					compact
					labels={{
						language: tFilters("language"),
						country: tFilters("country"),
					}}
					language={language}
					onLanguageChange={setLanguage}
					country={country}
					onCountryChange={setCountry}
					languages={[
						{ value: "all", label: tFilters("allLanguages") },
						{ value: "fr", label: "Français" },
						{ value: "en", label: "English" },
					]}
					countries={[
						{ value: "all", label: tFilters("allCountries") },
						...FEED_COUNTRIES.map((code) => ({
							value: code,
							label: code === "OTHER" ? tFilters("diaspora") : code,
						})),
					]}
				/>
			</div>
			{!signedIn && tab === "forYou" && (
				<p className="-mt-2 text-muted-foreground text-sm">
					{t("signInForYou")}
				</p>
			)}
			{!mounted || feed.isPending ? (
				<FeedSkeleton />
			) : feed.items.length === 0 ? (
				<EmptyFeed signedIn={signedIn} />
			) : (
				<HomeFeed {...feed} />
			)}
		</div>
	);
}

function EmptyFeed({ signedIn }: { signedIn: boolean }) {
	const t = useTranslations("home.empty");
	return (
		<Empty className="rounded-3xl border border-border bg-card py-12">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<MessageSquareIcon />
				</EmptyMedia>
				<EmptyTitle>{t("title")}</EmptyTitle>
				<EmptyDescription>
					{signedIn ? t("member") : t("visitor")}
				</EmptyDescription>
			</EmptyHeader>
			<EmptyContent className="flex-row flex-wrap justify-center">
				<AskButton />
				{signedIn && (
					<Button
						variant="outline"
						render={<Link href="/onboarding/tags" />}
						nativeButton={false}
					>
						<TagIcon />
						{t("followTags")}
					</Button>
				)}
			</EmptyContent>
		</Empty>
	);
}

function VisitorHome({ hackathon }: { hackathon: HackathonData | undefined }) {
	const t = useTranslations("home.hero");
	return (
		<main className="mx-auto grid max-w-3xl gap-6 px-4 py-6 md:px-6 md:py-8">
			{/* Phone only: the promise before the feed (variant 4 of the prototype). */}
			<section className="grid gap-3 pt-4 md:hidden">
				<p className="font-mono font-semibold text-[0.68rem] text-muted-foreground uppercase tracking-widest">
					{t("eyebrow")}
				</p>
				<h1 className="text-balance font-bold text-3xl leading-tight tracking-tight">
					{t("title")}
				</h1>
				<p className="text-muted-foreground">{t("lead")}</p>
			</section>
			<Banner hackathon={hackathon} />
			<FeedSection signedIn={false} />
		</main>
	);
}

function MemberHome({
	name,
	hackathon,
}: {
	name: string;
	hackathon: HackathonData | undefined;
}) {
	const t = useTranslations("home");
	const mounted = useMounted();
	// The viewer's hour, read in the browser only: the server would use its own timezone.
	const greeting = mounted
		? t(`hello.${greetingKey(new Date().getHours())}`, {
				name: firstName(name),
			})
		: null;
	return (
		<main className="mx-auto grid max-w-6xl gap-8 px-4 py-6 md:grid-cols-[minmax(0,1fr)_20rem] md:px-6 md:py-8">
			{/* Tags are read from the database: without one there is nothing to onboard. */}
			{HAS_DATABASE && <TagsOnboardingRedirect />}
			<div className="grid min-w-0 content-start gap-5">
				{/* Phone only: greeting and compact ribbon (variant 4). */}
				<div className="grid gap-4 md:hidden">
					<div>
						{greeting ? (
							<h1 className="font-bold text-2xl tracking-tight">{greeting}</h1>
						) : (
							<Skeleton className="h-8 w-48" />
						)}
						<p className="text-muted-foreground">{t("hello.lead")}</p>
					</div>
					<Banner hackathon={hackathon} variant="ribbon" />
				</div>
				<FeedSection signedIn />
			</div>
			{/* Desktop only: sticky rail (variant 3). */}
			<aside className="sticky top-24 hidden content-start gap-4 self-start md:grid">
				<Banner hackathon={hackathon} variant="rail" />
				<GettingStartedCard />
				<FollowedTagsCard />
				<JobsModule />
			</aside>
		</main>
	);
}

/**
 * The first steps of a new Member, read from their account: a done step is ticked, an open one
 * links to where it is done. Gone once every step is done.
 */
function GettingStartedCard() {
	const t = useTranslations("home.start");
	const followed = useQuery({
		...orpc.tags.followed.queryOptions(),
		enabled: HAS_DATABASE,
	});
	const me = useQuery({
		...orpc.members.me.queryOptions(),
		enabled: HAS_DATABASE,
	});
	const progress = gettingStarted({
		followedCount: followed.data?.items.length,
		hasAskedQuestion: me.data?.hasAskedQuestion,
	});
	if (!progress || progress.complete) {
		return null;
	}
	const steps = [
		{ key: "account", done: true, href: null },
		{ key: "tags", done: progress.tags, href: "/onboarding/tags" },
		{ key: "question", done: progress.question, href: "/ask" },
	] as const;
	return (
		<section
			aria-labelledby="getting-started"
			className="grid gap-3 rounded-2xl border border-border bg-card p-5"
		>
			<div className="flex items-baseline justify-between gap-2">
				<p
					id="getting-started"
					className="font-mono font-semibold text-[0.68rem] text-muted-foreground uppercase tracking-widest"
				>
					{t("title")}
				</p>
				<p className="font-mono text-muted-foreground text-xs">
					{t("progress", { done: progress.done, total: steps.length })}
				</p>
			</div>
			<ul className="grid gap-2 text-sm">
				{steps.map(({ key, done, href }) => (
					<li key={key} className="flex items-center gap-2">
						{done ? (
							<span className="grid size-5 place-items-center rounded-full bg-emerald-600 text-white">
								<CheckIcon className="size-3" />
								<span className="sr-only">{t("done")}</span>
							</span>
						) : (
							<span className="size-5 rounded-full border border-border" />
						)}
						{done || !href ? (
							<span className={done ? undefined : "text-muted-foreground"}>
								{t(key)}
							</span>
						) : (
							<Link
								href={href}
								className="text-foreground underline-offset-4 hover:underline"
							>
								{t(key)}
							</Link>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}

/** The Tags behind « Pour toi », with a way to change them (#66). */
function FollowedTagsCard() {
	const t = useTranslations("home.followed");
	const followed = useQuery({
		...orpc.tags.followed.queryOptions(),
		enabled: HAS_DATABASE,
	});
	const tags = followed.data?.items.map((tag) => tag.name) ?? [];
	return (
		<section className="grid gap-3 rounded-2xl border border-border bg-card p-5">
			<p className="font-mono font-semibold text-[0.68rem] text-muted-foreground uppercase tracking-widest">
				{t("title")}
			</p>
			{tags.length === 0 ? (
				<p className="text-muted-foreground text-sm">{t("none")}</p>
			) : (
				<FollowedTags label="" tags={tags} className="flex-wrap" />
			)}
			<Button
				variant="outline"
				size="sm"
				className="justify-self-start"
				render={<Link href="/settings?tab=tags" />}
				nativeButton={false}
			>
				<TagIcon />
				{t("manage")}
			</Button>
		</section>
	);
}

function PageSkeleton() {
	return (
		<main className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
			<Skeleton className="h-56 rounded-3xl" />
			<Skeleton className="h-10 w-72 rounded-xl" />
			<Skeleton className="h-64 rounded-3xl" />
		</main>
	);
}
