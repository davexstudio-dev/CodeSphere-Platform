"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Skeleton } from "@codesphere/ui/components/atoms/skeleton";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

type Scope =
	| { kind: "country"; value: string }
	| { kind: "tag"; value: string };

/** Reputation rankings (#242): pick a country shown publicly, or type a Tag. */
export function RankingsPage() {
	const t = useTranslations("rankings");
	const format = useFormatter();
	const [scope, setScope] = useState<Scope | null>(null);
	const [tag, setTag] = useState("");
	const countries = useQuery(orpc.rankings.countries.queryOptions());

	const byCountry = useInfiniteQuery(
		orpc.rankings.byCountry.infiniteOptions({
			input: (cursor: string | undefined) => ({
				country: scope?.value ?? "",
				limit: 20,
				cursor,
			}),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (page) => page.nextCursor ?? undefined,
			enabled: scope?.kind === "country",
		}),
	);
	const byTag = useInfiniteQuery(
		orpc.rankings.byTag.infiniteOptions({
			input: (cursor: string | undefined) => ({
				tag: scope?.value ?? "",
				limit: 20,
				cursor,
			}),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (page) => page.nextCursor ?? undefined,
			enabled: scope?.kind === "tag",
		}),
	);
	const list = scope?.kind === "tag" ? byTag : byCountry;
	const items = list.data?.pages.flatMap((page) => page.items) ?? [];

	return (
		<main className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
			<h1 className="font-semibold text-2xl">{t("title")}</h1>
			<section aria-labelledby="rank-countries" className="grid gap-2">
				<h2 id="rank-countries" className="font-semibold text-lg">
					{t("byCountry")}
				</h2>
				{countries.isPending ? (
					<Skeleton className="h-10 rounded-xl" />
				) : (countries.data?.items.length ?? 0) === 0 ? (
					<p className="text-muted-foreground text-sm">{t("noCountry")}</p>
				) : (
					<ul className="flex flex-wrap gap-2">
						{countries.data?.items.map((c) => (
							<li key={c.country}>
								<Button
									variant={
										scope?.kind === "country" && scope.value === c.country
											? "default"
											: "outline"
									}
									size="sm"
									onClick={() =>
										setScope({ kind: "country", value: c.country })
									}
								>
									{c.country} · {t("members", { count: c.members })}
								</Button>
							</li>
						))}
					</ul>
				)}
			</section>
			<section aria-labelledby="rank-tags" className="grid gap-2">
				<h2 id="rank-tags" className="font-semibold text-lg">
					{t("byTag")}
				</h2>
				<form
					className="flex gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						if (tag.trim()) {
							setScope({ kind: "tag", value: tag.trim() });
						}
					}}
				>
					<Input
						aria-label={t("tagLabel")}
						placeholder="sql"
						value={tag}
						onChange={(e) => setTag(e.target.value)}
					/>
					<Button type="submit" variant="outline">
						{t("show")}
					</Button>
				</form>
			</section>
			{scope && (
				<section aria-label={t("ranking")} className="grid gap-2">
					{list.isPending ? (
						<Skeleton className="h-32 rounded-xl" />
					) : list.isError ? (
						<p className="text-muted-foreground text-sm">{t("error")}</p>
					) : items.length === 0 ? (
						<p className="text-muted-foreground text-sm">{t("empty")}</p>
					) : (
						<ol className="grid gap-1">
							{items.map((member) => (
								<li
									key={member.id}
									className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm"
								>
									<span>
										<span className="text-muted-foreground">
											{member.rank}.
										</span>{" "}
										<span className="font-medium">{member.name}</span>
										{member.country ? ` · ${member.country}` : ""}
									</span>
									<span className="font-semibold">
										{t("reputation", {
											count: format.number(member.reputation),
										})}
									</span>
								</li>
							))}
						</ol>
					)}
					{list.hasNextPage && (
						<Button
							variant="outline"
							className="self-start"
							disabled={list.isFetchingNextPage}
							onClick={() => list.fetchNextPage()}
						>
							{t("more")}
						</Button>
					)}
				</section>
			)}
		</main>
	);
}
