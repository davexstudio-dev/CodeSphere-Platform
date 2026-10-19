"use client";

import type { WatchItem } from "@codesphere/contract";
import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Tag } from "@codesphere/ui/components/atoms/tag";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	BookmarkIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	FlagIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { errorCodeOf } from "@/i18n/errors";
import { getServerUrl } from "@/lib/server-url";
import { orpc } from "@/utils/orpc";

/**
 * A watch item (#255): title (an external link), source, summary, Tags, language, votes and
 * « Garder pour plus tard ». Voting, keeping and reporting need a signed-in Member.
 */
export function WatchCard({
	item,
	signedIn,
	onSignIn,
}: {
	item: WatchItem;
	signedIn: boolean;
	onSignIn: () => void;
}) {
	const t = useTranslations("watch");
	const format = useFormatter();
	const queryClient = useQueryClient();
	const [reporting, setReporting] = useState(false);
	const [reason, setReason] = useState("");
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: orpc.watch.list.key() });
	const failed = (error: unknown) =>
		toast.error(
			errorCodeOf(error) === "PRIVILEGE_REQUIRED"
				? t("needReputation")
				: t("error"),
		);
	const vote = useMutation(
		orpc.watch.vote.mutationOptions({ onSuccess: refresh, onError: failed }),
	);
	const save = useMutation(
		orpc.watch.save.mutationOptions({ onSuccess: refresh, onError: failed }),
	);
	const report = useMutation(
		orpc.watch.report.mutationOptions({
			onSuccess: () => {
				toast.success(t("reported"));
				setReporting(false);
				setReason("");
			},
			onError: failed,
		}),
	);
	const cast = (value: 1 | -1) =>
		signedIn
			? vote.mutate({
					itemId: item.id,
					value: item.myVote === value ? 0 : value,
				})
			: onSignIn();

	return (
		<article className="grid gap-2 rounded-2xl border p-4">
			<h3 className="font-semibold text-lg leading-snug">
				<a
					// Through the redirect, which counts the click per item (no record of who).
					href={`${getServerUrl()}/api/v1/watch/out/${item.id}`}
					target="_blank"
					rel="noopener noreferrer nofollow ugc"
					className="hover:underline"
				>
					{item.title}
				</a>
			</h3>
			<p className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
				<span>{item.sourceName ?? item.domain}</span>
				<span aria-hidden="true">·</span>
				<time dateTime={item.publishedAt.toISOString()}>
					{format.dateTime(item.publishedAt, { dateStyle: "medium" })}
				</time>
				<Badge variant="outline">{item.language.toUpperCase()}</Badge>
				{item.africanSource && <Badge variant="success">{t("african")}</Badge>}
				{item.origin !== "source" && (
					<Badge variant="secondary">{t(`origin.${item.origin}`)}</Badge>
				)}
				{item.visibility === "pending" && (
					<Badge variant="warning">{t("pending")}</Badge>
				)}
			</p>
			{item.summary && <p className="text-sm">{item.summary}</p>}
			{item.tags.length > 0 && (
				<ul className="flex flex-wrap gap-1">
					{item.tags.map((tag) => (
						<li key={tag}>
							<Tag>{tag}</Tag>
						</li>
					))}
				</ul>
			)}
			<div className="flex flex-wrap items-center gap-2">
				<Button
					size="sm"
					variant={item.myVote === 1 ? "default" : "outline"}
					aria-pressed={item.myVote === 1}
					aria-label={t("upvote")}
					disabled={vote.isPending}
					onClick={() => cast(1)}
				>
					<ChevronUpIcon />
				</Button>
				<span className="min-w-6 text-center font-medium text-sm">
					{item.score}
				</span>
				<Button
					size="sm"
					variant={item.myVote === -1 ? "default" : "outline"}
					aria-pressed={item.myVote === -1}
					aria-label={t("downvote")}
					disabled={vote.isPending}
					onClick={() => cast(-1)}
				>
					<ChevronDownIcon />
				</Button>
				<Button
					size="sm"
					variant={item.saved ? "default" : "outline"}
					aria-pressed={item.saved}
					disabled={save.isPending}
					onClick={() =>
						signedIn
							? save.mutate({ itemId: item.id, saved: !item.saved })
							: onSignIn()
					}
				>
					<BookmarkIcon />
					{item.saved ? t("saved") : t("save")}
				</Button>
				<Button
					size="sm"
					variant="ghost"
					onClick={() =>
						signedIn ? setReporting((open) => !open) : onSignIn()
					}
				>
					<FlagIcon />
					{t("report")}
				</Button>
			</div>
			{reporting && (
				<form
					className="flex flex-wrap gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						report.mutate({ itemId: item.id, reason });
					}}
				>
					<Input
						value={reason}
						onChange={(event) => setReason(event.target.value)}
						maxLength={300}
						required
						aria-label={t("reportReason")}
						placeholder={t("reportReason")}
						className="min-w-0 flex-1"
					/>
					<Button size="sm" type="submit" disabled={report.isPending}>
						{t("reportSend")}
					</Button>
				</form>
			)}
		</article>
	);
}
