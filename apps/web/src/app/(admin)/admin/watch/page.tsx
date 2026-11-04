"use client";

import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { StatStrip } from "@codesphere/ui/components/organisms/stat-strip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import {
	ConfirmWithNote,
	useReasonDecision,
} from "@/components/admin-decision";
import AdminFrame from "@/components/admin-frame";
import { adminErrorKey } from "@/i18n/errors";
import { orpc } from "@/utils/orpc";

/** Back-office of the watch feed (#255): Sources, proposals and reports, blocked domains. */
export default function AdminWatchPage() {
	const t = useTranslations("admin.watch");
	const tErrors = useTranslations("admin.watch.errors");
	const format = useFormatter();
	const { ask, dialog } = useReasonDecision();
	const queryClient = useQueryClient();
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: orpc.admin.watch.key() });
	const onError = (error: unknown) =>
		toast.error(tErrors(adminErrorKey(error)));
	const options = { onSuccess: refresh, onError };

	const sources = useQuery(
		orpc.admin.watch.sources.list.queryOptions({ input: {} }),
	);
	const review = useQuery(
		orpc.admin.watch.items.review.queryOptions({ input: { limit: 50 } }),
	);
	const domains = useQuery(
		orpc.admin.watch.domains.list.queryOptions({ input: {} }),
	);

	const create = useMutation(
		orpc.admin.watch.sources.create.mutationOptions({
			...options,
			onSuccess: () => {
				refresh();
				setName("");
				setFeedUrl("");
				setTags("");
			},
		}),
	);
	const update = useMutation(
		orpc.admin.watch.sources.update.mutationOptions(options),
	);
	const remove = useMutation(
		orpc.admin.watch.sources.remove.mutationOptions({
			...options,
			onSuccess: ({ removedItems }) => {
				refresh();
				toast.success(t("sources.removed", { count: removedItems }));
			},
		}),
	);
	const approve = useMutation(
		orpc.admin.watch.items.approve.mutationOptions(options),
	);
	const removeItem = useMutation(
		orpc.admin.watch.items.remove.mutationOptions(options),
	);
	const block = useMutation(
		orpc.admin.watch.domains.block.mutationOptions({
			...options,
			onSuccess: () => {
				refresh();
				setDomain("");
			},
		}),
	);
	const unblock = useMutation(
		orpc.admin.watch.domains.unblock.mutationOptions(options),
	);
	const ingest = useMutation(
		orpc.admin.watch.ingest.mutationOptions({
			onError,
			onSuccess: (result) => {
				refresh();
				toast.success(t("sources.ingested", result));
			},
		}),
	);

	const [name, setName] = useState("");
	const [feedUrl, setFeedUrl] = useState("");
	const [tags, setTags] = useState("");
	const [language, setLanguage] = useState<"fr" | "en">("fr");
	const [african, setAfrican] = useState(false);
	const [domain, setDomain] = useState("");

	return (
		<AdminFrame
			title={t("title")}
			description={t("description")}
			actions={
				<Button
					size="sm"
					variant="outline"
					disabled={ingest.isPending}
					onClick={() => ingest.mutate({})}
				>
					{t("sources.ingest")}
				</Button>
			}
		>
			<StatStrip
				className="sm:grid-cols-2 lg:grid-cols-4"
				items={[
					{
						label: t("stats.sources"),
						value: String(
							sources.data?.items.filter((s) => s.active).length ?? 0,
						),
					},
					{
						label: t("review.title"),
						value: String(review.data?.items.length ?? 0),
					},
					{
						label: t("stats.errors"),
						value: String(
							sources.data?.items.filter((s) => s.lastError).length ?? 0,
						),
					},
					{
						label: t("domains.title"),
						value: String(domains.data?.items.length ?? 0),
					},
				]}
			/>
			<section aria-labelledby="w-review" className="grid gap-3">
				<h2 id="w-review" className="font-semibold text-lg">
					{t("review.title")}
				</h2>
				{(review.data?.items.length ?? 0) === 0 ? (
					<p className="text-muted-foreground text-sm">{t("review.none")}</p>
				) : (
					<ul className="grid gap-4 md:grid-cols-2">
						{review.data?.items.map((item) => (
							<li
								key={item.id}
								className="grid content-start gap-2 rounded-xl border bg-card p-5 text-sm"
							>
								<a
									href={item.url}
									target="_blank"
									rel="noopener noreferrer nofollow ugc"
									className="font-semibold text-base leading-snug hover:underline"
								>
									{item.title}
								</a>
								<span className="text-muted-foreground text-xs">
									{item.domain} · {t(`review.origin.${item.origin}`)} ·{" "}
									{t("review.score", { score: item.score })}
									{item.visibility === "pending"
										? ` · ${t("review.pending")}`
										: ""}
								</span>
								{item.reports > 0 && (
									<span className="text-destructive text-xs">
										{t("review.reports", { count: item.reports })} :{" "}
										{item.reasons.join(" / ")}
									</span>
								)}
								<span className="flex flex-wrap gap-2">
									{item.visibility === "pending" && (
										<Button
											size="sm"
											onClick={() => approve.mutate({ itemId: item.id })}
										>
											{t("review.approve")}
										</Button>
									)}
									<Button
										size="sm"
										variant="destructive"
										onClick={() =>
											ask({
												title: item.title,
												description: item.domain,
												confirmLabel: t("review.remove"),
												reasonLabel: t("review.reason"),
												onSubmit: (reason) =>
													removeItem.mutate({ itemId: item.id, reason }),
											})
										}
									>
										{t("review.remove")}
									</Button>
									<ConfirmWithNote
										label={t("review.blockDomain")}
										note={t("domains.confirmBlock", { domain: item.domain })}
										onConfirm={() => block.mutate({ domain: item.domain })}
									/>
								</span>
							</li>
						))}
					</ul>
				)}
			</section>

			<section aria-labelledby="w-sources" className="grid gap-3">
				<h2 id="w-sources" className="font-semibold text-lg">
					{t("sources.title")}
				</h2>
				<form
					className="flex flex-wrap items-center gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						create.mutate({
							name,
							feedUrl,
							language,
							african,
							tags: tags
								.split(",")
								.map((tag) => tag.trim())
								.filter(Boolean)
								.slice(0, 5),
						});
					}}
				>
					<Input
						required
						value={name}
						onChange={(e) => setName(e.target.value)}
						aria-label={t("sources.name")}
						placeholder={t("sources.name")}
						className="w-48"
					/>
					<Input
						required
						type="url"
						value={feedUrl}
						onChange={(e) => setFeedUrl(e.target.value)}
						aria-label={t("sources.feedUrl")}
						placeholder="https://…/feed.xml"
						className="min-w-64 flex-1"
					/>
					<Input
						value={tags}
						onChange={(e) => setTags(e.target.value)}
						aria-label={t("sources.tags")}
						placeholder={t("sources.tags")}
						className="w-48"
					/>
					{(["fr", "en"] as const).map((l) => (
						<Button
							key={l}
							type="button"
							size="sm"
							variant={language === l ? "default" : "outline"}
							aria-pressed={language === l}
							onClick={() => setLanguage(l)}
						>
							{l.toUpperCase()}
						</Button>
					))}
					<Button
						type="button"
						size="sm"
						variant={african ? "default" : "outline"}
						aria-pressed={african}
						onClick={() => setAfrican((on) => !on)}
					>
						{t("sources.african")}
					</Button>
					<Button type="submit" disabled={create.isPending}>
						{t("sources.add")}
					</Button>
				</form>
				{(sources.data?.items.length ?? 0) === 0 ? (
					<p className="text-muted-foreground text-sm">{t("sources.none")}</p>
				) : (
					<ul className="divide-y divide-border rounded-xl border bg-card">
						{sources.data?.items.map((s) => (
							<li
								key={s.id}
								className="flex flex-wrap items-center gap-2 p-3 text-sm"
							>
								<span className="font-medium">{s.name}</span>
								<span className="text-muted-foreground">{s.domain}</span>
								<Badge variant="outline">{s.language.toUpperCase()}</Badge>
								{s.african && (
									<Badge variant="success">{t("sources.african")}</Badge>
								)}
								<Badge variant={s.active ? "secondary" : "warning"}>
									{s.active ? t("sources.active") : t("sources.stopped")}
								</Badge>
								<span className="text-muted-foreground text-xs">
									{t("sources.items", { count: s.itemCount })}
									{" · "}
									{s.lastFetchedAt
										? t("sources.fetched", {
												date: format.dateTime(s.lastFetchedAt, {
													dateStyle: "short",
													timeStyle: "short",
												}),
											})
										: t("sources.neverFetched")}
								</span>
								{s.lastError && (
									<Badge variant="destructive">{s.lastError}</Badge>
								)}
								<span className="ml-auto flex gap-2">
									<Button
										size="sm"
										variant="outline"
										onClick={() =>
											update.mutate({ id: s.id, active: !s.active })
										}
									>
										{s.active ? t("sources.stop") : t("sources.resume")}
									</Button>
									<ConfirmWithNote
										label={t("sources.remove")}
										note={t("sources.confirmRemove", { name: s.name })}
										onConfirm={() => remove.mutate({ id: s.id })}
									/>
								</span>
							</li>
						))}
					</ul>
				)}
			</section>

			<section aria-labelledby="w-domains" className="grid gap-3">
				<h2 id="w-domains" className="font-semibold text-lg">
					{t("domains.title")}
				</h2>
				<form
					className="flex flex-wrap gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						block.mutate({ domain });
					}}
				>
					<Input
						required
						value={domain}
						onChange={(e) => setDomain(e.target.value)}
						aria-label={t("domains.domain")}
						placeholder="example.com"
						className="w-64"
					/>
					<Button type="submit" disabled={block.isPending}>
						{t("domains.block")}
					</Button>
				</form>
				{(domains.data?.items.length ?? 0) === 0 ? (
					<p className="text-muted-foreground text-sm">{t("domains.none")}</p>
				) : (
					<ul className="divide-y divide-border rounded-xl border bg-card">
						{domains.data?.items.map((d) => (
							<li
								key={d.domain}
								className="flex flex-wrap items-center gap-2 p-3 text-sm"
							>
								<span className="font-mono">{d.domain}</span>
								{d.reason && (
									<span className="text-muted-foreground text-xs">
										{d.reason}
									</span>
								)}
								<Button
									size="sm"
									variant="ghost"
									onClick={() => unblock.mutate({ domain: d.domain })}
								>
									{t("domains.unblock")}
								</Button>
							</li>
						))}
					</ul>
				)}
			</section>
			{dialog}
		</AdminFrame>
	);
}
