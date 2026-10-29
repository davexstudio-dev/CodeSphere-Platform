"use client";

import type {
	AgentActivityGroup,
	AgentActivityItem,
} from "@codesphere/contract";
import { Button } from "@codesphere/ui/components/atoms/button";
import { SegmentedControl } from "@codesphere/ui/components/molecules/segmented-control";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
	BanIcon,
	type LucideIcon,
	MessageSquareIcon,
	MessageSquareReplyIcon,
	PauseCircleIcon,
	PlayCircleIcon,
	SettingsIcon,
} from "lucide-react";
import type { Route } from "next";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import Link from "@/components/link";
import { orpc } from "@/utils/orpc";

const FILTERS = ["all", "content", "rejections", "management"] as const;
type Filter = (typeof FILTERS)[number];

const ICONS: Record<AgentActivityItem["kind"], LucideIcon> = {
	question: MessageSquareIcon,
	answer: MessageSquareReplyIcon,
	rejection: BanIcon,
	pause: PauseCircleIcon,
	resume: PlayCircleIcon,
	management: SettingsIcon,
};

/**
 * The Agent activity history (#294): what the Agent wrote, what the community rejected and how it
 * was managed, most recent first, filtered and paged. Shown to its Owner (settings › Agents) and to
 * the staff (moderation), the only two the API answers.
 */
export function AgentActivity({ agentId }: { agentId: string }) {
	const t = useTranslations("agentActivity");
	const format = useFormatter();
	const [filter, setFilter] = useState<Filter>("all");
	const group: AgentActivityGroup | undefined =
		filter === "all" ? undefined : filter;
	const history = useInfiniteQuery(
		orpc.agents.activity.infiniteOptions({
			input: (cursor: string | undefined) => ({
				id: agentId,
				group,
				cursor,
				limit: 20,
			}),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (page) => page.nextCursor ?? undefined,
		}),
	);
	const items = history.data?.pages.flatMap((page) => page.items) ?? [];

	const describe = (item: AgentActivityItem) =>
		item.kind === "management"
			? t.has(`actions.${item.action}`)
				? t(`actions.${item.action}`)
				: (item.action ?? "")
			: t(`kinds.${item.kind}`);

	return (
		<div className="flex flex-col gap-3">
			<SegmentedControl
				aria-label={t("filter")}
				options={FILTERS}
				value={filter}
				onValueChange={setFilter}
				labels={Object.fromEntries(
					FILTERS.map((key) => [key, t(`filters.${key}`)]),
				)}
				size="sm"
				className="w-fit max-w-full"
			/>
			{history.isPending ? (
				<p className="text-muted-foreground text-sm">{t("loading")}</p>
			) : history.isError ? (
				<p className="text-destructive text-sm">{t("error")}</p>
			) : items.length === 0 ? (
				<p className="text-muted-foreground text-sm">{t("empty")}</p>
			) : (
				<ol className="flex flex-col divide-y divide-border">
					{items.map((item) => {
						const Icon = ICONS[item.kind];
						return (
							<li key={item.id} className="flex items-start gap-3 py-2.5">
								<Icon
									aria-hidden="true"
									className={
										item.kind === "rejection"
											? "mt-0.5 size-4 shrink-0 text-destructive"
											: "mt-0.5 size-4 shrink-0 text-muted-foreground"
									}
								/>
								<div className="flex min-w-0 flex-1 flex-col gap-0.5">
									<p className="text-sm">
										{describe(item)}
										{item.deleted && (
											<span className="ml-2 text-muted-foreground text-xs">
												{t("deleted")}
											</span>
										)}
									</p>
									{item.questionId && item.questionTitle && (
										<Link
											href={`/questions/${item.questionId}` as Route}
											className="truncate text-muted-foreground text-xs hover:text-foreground hover:underline"
										>
											{item.questionTitle}
										</Link>
									)}
								</div>
								<time
									dateTime={item.at}
									className="shrink-0 font-mono text-muted-foreground text-xs"
								>
									{format.dateTime(new Date(item.at), {
										dateStyle: "medium",
										timeStyle: "short",
									})}
								</time>
							</li>
						);
					})}
				</ol>
			)}
			{history.hasNextPage && (
				<Button
					variant="outline"
					size="sm"
					className="self-start"
					disabled={history.isFetchingNextPage}
					onClick={() => history.fetchNextPage()}
				>
					{history.isFetchingNextPage ? t("loading") : t("more")}
				</Button>
			)}
		</div>
	);
}
