"use client";

import type { QuestionListItem } from "@codesphere/contract";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Skeleton } from "@codesphere/ui/components/atoms/skeleton";
import { QuestionFeed } from "@codesphere/ui/components/organisms/question-feed";
import { useDataSaver } from "@codesphere/ui/lib/data-saver";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { Route } from "next";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import Link from "@/components/link";

import { pageSizeFor } from "@/lib/data-saver";
import { HAS_DATABASE } from "@/lib/deployment";
import { type FeedFilter, visibleItems } from "@/lib/home";
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
	const personal = useInfiniteQuery({
		...orpc.feed.forYou.infiniteOptions({
			input: (cursor: string | undefined) => ({ cursor, limit: pageSize }),
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
	// A Question never appears twice, even if a page boundary moves under a live feed.
	const items = visibleItems(
		(query.data?.pages ?? []).flatMap((page) => page.items),
		filter,
	);
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
	items: QuestionListItem[];
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
			<QuestionFeed
				className="md:columns-1"
				questions={items.map((q) => ({
					id: q.id,
					title: q.title,
					excerpt: q.excerpt,
					tags: q.tags,
					score: q.score,
					answers: q.answerCount,
					answersLabel: t("answers", { count: q.answerCount }),
					answered: q.status === "answered",
					author: q.authorName || tMember("unnamed"),
					agentOf:
						q.authorKind === "agent"
							? q.ownerName || tMember("unnamed")
							: undefined,
					reputation:
						q.authorReputation === null
							? undefined
							: tMember("reputation", { count: q.authorReputation }),
					region: q.authorCountry ?? "—",
					lang: q.language,
					href: `/questions/${q.id}`,
					linkAs: CardLink,
					// Relative to the viewer's clock, so only once mounted (no hydration mismatch).
					ago: mounted ? format.relativeTime(new Date(q.createdAt), now) : "…",
				}))}
			/>
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
