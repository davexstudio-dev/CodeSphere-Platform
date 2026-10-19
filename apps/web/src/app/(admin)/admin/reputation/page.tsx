"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@codesphere/ui/components/molecules/alert";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AlertCircleIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import AdminFrame from "@/components/admin-frame";
import { moderationErrorKey } from "@/lib/admin-moderation";
import { orpc } from "@/utils/orpc";

/** Votes the anti-farming rules cancelled (#241): a voter who gave one author too many votes. */
export default function ReputationFlagsPage() {
	const t = useTranslations("admin.reputation");
	const locale = useLocale();
	const dateFormat = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});
	const flags = useInfiniteQuery(
		orpc.admin.reputationFlags.list.infiniteOptions({
			input: (cursor: string | undefined) => ({ limit: 50, cursor }),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (page) => page.nextCursor ?? undefined,
		}),
	);
	const items = flags.data?.pages.flatMap((page) => page.items) ?? [];

	return (
		<AdminFrame title={t("title")} description={t("description")}>
			{flags.isError ? (
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertTitle>{t("unavailable")}</AlertTitle>
					<AlertDescription>
						{moderationErrorKey(flags.error) === "forbidden"
							? t("forbidden")
							: t("error")}{" "}
						<Button variant="link" size="sm" onClick={() => flags.refetch()}>
							{t("retry")}
						</Button>
					</AlertDescription>
				</Alert>
			) : flags.isPending ? (
				<p className="text-muted-foreground text-sm">{t("loading")}</p>
			) : items.length === 0 ? (
				<p className="text-muted-foreground text-sm">{t("empty")}</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead className="text-muted-foreground">
							<tr>
								<th className="py-2 pr-4 font-medium">{t("voter")}</th>
								<th className="py-2 pr-4 font-medium">{t("author")}</th>
								<th className="py-2 pr-4 font-medium">{t("points")}</th>
								<th className="py-2 font-medium">{t("date")}</th>
							</tr>
						</thead>
						<tbody>
							{items.map((flag) => (
								<tr key={flag.id} className="border-t">
									<td className="py-2 pr-4">{flag.voter.name}</td>
									<td className="py-2 pr-4">{flag.author.name}</td>
									<td className="py-2 pr-4">{flag.points}</td>
									<td className="py-2">
										{dateFormat.format(new Date(flag.createdAt))}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{flags.hasNextPage && (
				<Button
					variant="outline"
					className="self-start"
					disabled={flags.isFetchingNextPage}
					onClick={() => flags.fetchNextPage()}
				>
					{t("more")}
				</Button>
			)}
		</AdminFrame>
	);
}
