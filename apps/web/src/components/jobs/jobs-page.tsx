"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Skeleton } from "@codesphere/ui/components/atoms/skeleton";
import { useDataSaver } from "@codesphere/ui/lib/data-saver";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { JobCard } from "@/components/jobs/job-card";
import Link from "@/components/link";
import { pageSizeFor } from "@/lib/data-saver";
import { orpc } from "@/utils/orpc";

/** The live job postings, filtered by country, Tag and remote (#258). */
export function JobsPage() {
	const t = useTranslations("jobs");
	const pageSize = pageSizeFor(20, useDataSaver());
	const [country, setCountry] = useState("");
	const [tag, setTag] = useState("");
	const [remote, setRemote] = useState(false);
	const list = useInfiniteQuery(
		orpc.jobs.list.infiniteOptions({
			input: (cursor: string | undefined) => ({
				limit: pageSize,
				cursor,
				country:
					country.trim().length >= 2 ? country.trim().toUpperCase() : undefined,
				tag: tag.trim().toLowerCase() || undefined,
				remote: remote ? true : undefined,
			}),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (page) => page.nextCursor ?? undefined,
		}),
	);
	const items = list.data?.pages.flatMap((page) => page.items) ?? [];

	return (
		<main className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
			<header className="grid gap-2">
				<h1 className="font-semibold text-2xl">{t("title")}</h1>
				<p className="text-muted-foreground">{t("intro")}</p>
				<Button
					className="w-fit"
					render={<Link href="/jobs/new" />}
					nativeButton={false}
				>
					{t("publish")}
				</Button>
			</header>
			<div className="flex flex-wrap items-center gap-2">
				<Input
					value={country}
					maxLength={5}
					onChange={(e) => setCountry(e.target.value)}
					aria-label={t("country")}
					placeholder={t("country")}
					className="w-28"
				/>
				<Input
					value={tag}
					maxLength={40}
					onChange={(e) => setTag(e.target.value)}
					aria-label={t("tag")}
					placeholder={t("tag")}
					className="w-40"
				/>
				<Button
					size="sm"
					variant={remote ? "default" : "outline"}
					aria-pressed={remote}
					onClick={() => setRemote((on) => !on)}
				>
					{t("remote")}
				</Button>
			</div>
			{list.isPending ? (
				<Skeleton className="h-32 rounded-2xl" />
			) : list.isError ? (
				<p className="text-muted-foreground text-sm">
					{t("error")}{" "}
					<Button variant="link" size="sm" onClick={() => list.refetch()}>
						{t("retry")}
					</Button>
				</p>
			) : items.length === 0 ? (
				<p className="text-muted-foreground">{t("empty")}</p>
			) : (
				<ul className="grid gap-3">
					{items.map((job) => (
						<li key={job.id}>
							<JobCard job={job} />
						</li>
					))}
				</ul>
			)}
			{list.hasNextPage && (
				<Button
					variant="outline"
					disabled={list.isFetchingNextPage}
					onClick={() => list.fetchNextPage()}
				>
					{t("more")}
				</Button>
			)}
		</main>
	);
}
