"use client";

import type { MixedItem } from "@codesphere/contract";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Skeleton } from "@codesphere/ui/components/atoms/skeleton";
import { QuestionFeed } from "@codesphere/ui/components/organisms/question-feed";
import { useDataSaver } from "@codesphere/ui/lib/data-saver";
import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type { Route } from "next";
import { useFormatter, useLocale, useNow, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import Link from "@/components/link";
import { WatchCard } from "@/components/watch/watch-card";

import { pageSizeFor } from "@/lib/data-saver";
import { HAS_DATABASE } from "@/lib/deployment";
import { type FeedFilter, visibleEntries } from "@/lib/home";
import { useMounted } from "@/lib/use-mounted";
import { orpc } from "@/utils/orpc";

export type FeedTab = "forYou" | "recent" | "unanswered";

const PAGE_SIZE = 20;

/**
 * The home feed (#66): one infinite list per tab. « Pour toi » is the Member's feed; a visitor, who
 * has none, sees the hottest Questions instead. `snapshotAt` and the cursors keep the order stable,
 * so pages never repeat a Question.
 */
export function useFeed(tab: FeedTab, signedIn: boolean, filter: FeedFilter) {
	// Shorter pages in data saver mode (#250).
	const pageSize = pageSizeFor(PAGE_SIZE, useDataSaver());
	const forYou = tab === "forYou" && signedIn;
	const language =
		filter.language === "fr" || filter.language === "en"
			? filter.language
			: undefined;
	const country = filter.country === "all" ? undefined : filter.country;
	const locale = useLocale();
	const reader = locale === "fr" || locale === "en" ? locale : undefined;
	const personal = useInfiniteQuery({
		...orpc.feed.mixed.infiniteOptions({
			input: (cursor: string | undefined) => ({
				cursor,
				limit: pageSize,
				language: reader,
			}),
			initialPageParam: undefined,
			getNextPageParam: (last) => last.nextCursor ?? undefined,
		}),
		enabled: HAS_DATABASE && forYou,
	});
	const listed = useInfiniteQuery({
		...orpc.questions.list.infiniteOptions({
			input: (cursor: string | undefined) => ({
				cursor,
				limit: pageSize,
				language,
				country,
				sort:
					tab === "forYou"
						? ("hot" as const)
						: tab === "unanswered"
							? ("unanswered" as const)
							: ("recent" as const),
			}),
			initialPageParam: undefined,
			getNextPageParam: (last) => last.nextCursor ?? undefined,
		}),
		enabled: HAS_DATABASE && !forYou,
	});
	const query = forYou ? personal : listed;
	// Every entry appears once, even if a page boundary moves under a live feed.
	const entries: MixedItem[] = forYou
		? (personal.data?.pages ?? []).flatMap((page) => page.items)
		: (listed.data?.pages ?? []).flatMap((page) =>
				page.items.map(
					(question): MixedItem => ({
						kind: "question",
						question,
						reasons: [],
						sourceKey: null,
						sourceName: null,
					}),
				),
			);
	const items = visibleEntries(entries, filter);
	return {
		items,
		isPending: HAS_DATABASE && query.isPending,
		hasNextPage: query.hasNextPage,
		isFetchingNextPage: query.isFetchingNextPage,
		fetchNextPage: query.fetchNextPage,
	};
}

/** The card's link: built from a Question id, so a route the typed `Link` cannot check. */
function CardLink({
	href,
	...props
}: {
	href: string;
	className?: string;
	children?: React.ReactNode;
}) {
	return <Link href={href as Route} {...props} />;
}

export function HomeFeed({
	items,
	hasNextPage,
	isFetchingNextPage,
	fetchNextPage,
}: {
	items: MixedItem[];
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	fetchNextPage: () => unknown;
}) {
	const t = useTranslations("home.feed");
	const tMember = useTranslations("member");
	const format = useFormatter();
	// The reference for « il y a 5 min », refreshed every minute.
	const now = useNow({ updateInterval: 60_000 });
	const mounted = useMounted();
	const sentinel = useRef<HTMLDivElement>(null);

	// Infinite scroll: the next page is requested as the end of the list nears the viewport.
	useEffect(() => {
		const node = sentinel.current;
		if (!node || !hasNextPage) {
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					void fetchNextPage();
				}
			},
			{ rootMargin: "400px" },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, [hasNextPage, fetchNextPage]);

	return (
		<div className="grid gap-4">
			{items.map((entry) =>
				entry.kind === "watch" ? (
					<div key={entry.item.id} className="grid gap-1">
						<WatchCard item={entry.item} signedIn onSignIn={() => undefined} />
						<FeedWhy entry={entry} />
					</div>
				) : (
					<div key={entry.question.id} className="grid gap-1">
						<QuestionFeed
							className="md:columns-1"
							questions={[
								{
									id: entry.question.id,
									title: entry.question.title,
									excerpt: entry.question.excerpt,
									tags: entry.question.tags,
									score: entry.question.score,
									answers: entry.question.answerCount,
									answersLabel: t("answers", {
										count: entry.question.answerCount,
									}),
									answered: entry.question.status === "answered",
									author: entry.question.authorName || tMember("unnamed"),
									agentOf:
										entry.question.authorKind === "agent"
											? entry.question.ownerName || tMember("unnamed")
											: undefined,
									reputation:
										entry.question.authorReputation === null
											? undefined
											: tMember("reputation", {
													count: entry.question.authorReputation,
												}),
									region: entry.question.authorCountry ?? "—",
									lang: entry.question.language,
									href: `/questions/${entry.question.id}`,
									linkAs: CardLink,
									// Relative to the viewer's clock, so only once mounted (no hydration mismatch).
									ago: mounted
										? format.relativeTime(
												new Date(entry.question.createdAt),
												now,
											)
										: "…",
								},
							]}
						/>
						<FeedWhy entry={entry} />
					</div>
				),
			)}
			<div ref={sentinel} aria-hidden className="h-px" />
			{hasNextPage && (
				<Button
					variant="outline"
					className="justify-self-center"
					disabled={isFetchingNextPage}
					onClick={() => void fetchNextPage()}
				>
					{isFetchingNextPage ? t("loading") : t("more")}
				</Button>
			)}
		</div>
	);
}

export function FeedSkeleton() {
	return (
		<div className="grid gap-4">
			<Skeleton className="h-40 rounded-xl" />
			<Skeleton className="h-40 rounded-xl" />
			<Skeleton className="h-40 rounded-xl" />
		</div>
	);
}

/**
 * Why a card is in « Pour toi » (#256), and « Moins comme ça »: hide its main Tag or its Source.
 * Nothing is shown on the other tabs, where there is no ranking to explain.
 */
function FeedWhy({ entry }: { entry: MixedItem }) {
	const t = useTranslations("home.why");
	const queryClient = useQueryClient();
	const mute = useMutation(
		orpc.feed.mute.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({ queryKey: orpc.feed.key() });
			},
		}),
	);
	if (entry.reasons.length === 0) {
		return null;
	}
	const tags =
		entry.kind === "question" ? entry.question.tags : entry.item.tags;
	const tag = entry.reasons.find((r) => r.value)?.value ?? tags[0];
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-muted-foreground text-xs">
			<span>
				{t("because")}{" "}
				{entry.reasons
					.map((r) => t(`reason.${r.code}`, { tag: r.value ?? "" }))
					.join(" · ")}
			</span>
			{tag && (
				<Button
					size="sm"
					variant="ghost"
					disabled={mute.isPending}
					onClick={() => mute.mutate({ kind: "tag", key: tag })}
				>
					{t("lessTag", { tag })}
				</Button>
			)}
			{entry.sourceKey && (
				<Button
					size="sm"
					variant="ghost"
					disabled={mute.isPending}
					onClick={() =>
						mute.mutate({ kind: "source", key: entry.sourceKey as string })
					}
				>
					{t("lessSource", { source: entry.sourceName ?? entry.sourceKey })}
				</Button>
			)}
		</div>
	);
}
