"use client";

import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Skeleton } from "@codesphere/ui/components/atoms/skeleton";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import { useFormatter, useNow, useTranslations } from "next-intl";

import Link from "@/components/link";
import { useMounted } from "@/lib/use-mounted";
import { orpc } from "@/utils/orpc";

/** Every listed Hackathon (#325): the running ones first, drafts and archives never. */
export default function HackathonsPage() {
	const t = useTranslations("hackathonsPage");
	const format = useFormatter();
	const now = useNow({ updateInterval: 60_000 });
	const mounted = useMounted();
	const list = useQuery(
		orpc.hackathons.list.queryOptions({ input: { limit: 50 } }),
	);
	const items = [...(list.data?.items ?? [])].sort(
		(a, b) => Number(a.status === "ended") - Number(b.status === "ended"),
	);

	return (
		<main className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
			<header className="grid gap-2">
				<h1 className="font-semibold text-2xl">{t("title")}</h1>
				<p className="text-muted-foreground">{t("intro")}</p>
			</header>
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
					{items.map((hackathon) => {
						const next = hackathon.milestones.find(
							(m) => new Date(m.startsAt) > now,
						);
						return (
							<li
								key={hackathon.slug}
								className="grid gap-2 rounded-2xl border bg-card p-5"
							>
								<div className="flex flex-wrap items-start justify-between gap-2">
									<h2 className="min-w-0 flex-[1_1_14rem] font-semibold text-lg leading-snug">
										<Link
											href={`/hackathons/${hackathon.slug}` as Route}
											className="hover:underline"
										>
											{hackathon.name}
										</Link>
									</h2>
									<Badge
										variant={
											hackathon.status === "ended" ? "secondary" : "default"
										}
									>
										{t(hackathon.status === "ended" ? "ended" : "published")}
									</Badge>
								</div>
								<p className="text-muted-foreground text-sm">
									{t("organizedBy", { name: hackathon.organizer })}
								</p>
								<p className="text-sm">{hackathon.summary}</p>
								{mounted && next && hackathon.status === "published" && (
									<p className="text-muted-foreground text-xs">
										{t("next", {
											label: next.label,
											date: format.dateTime(new Date(next.startsAt), {
												day: "numeric",
												month: "long",
											}),
										})}
									</p>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</main>
	);
}
