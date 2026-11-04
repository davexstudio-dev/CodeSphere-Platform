"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Skeleton } from "@codesphere/ui/components/atoms/skeleton";
import { Textarea } from "@codesphere/ui/components/atoms/textarea";
import { useDataSaver } from "@codesphere/ui/lib/data-saver";
import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import SsoLoginDialog from "@/components/sso-login-dialog";
import { WatchCard } from "@/components/watch/watch-card";
import { errorCodeOf } from "@/i18n/errors";
import { authClient } from "@/lib/auth-client";
import { pageSizeFor } from "@/lib/data-saver";
import { orpc } from "@/utils/orpc";

type View = "recent" | "pending" | "saved";
const VIEWS: readonly View[] = ["recent", "pending", "saved"];

/** The watch feed (#255): trusted Sources' links and approved proposals, with a way to propose one. */
export function WatchPage() {
	const t = useTranslations("watch");
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();
	const pageSize = pageSizeFor(20, useDataSaver());
	const [view, setView] = useState<View>("recent");
	const [african, setAfrican] = useState(false);
	const [language, setLanguage] = useState<"" | "fr" | "en">("");
	const [signingIn, setSigningIn] = useState(false);
	const signedIn = Boolean(session);

	const list = useInfiniteQuery(
		orpc.watch.list.infiniteOptions({
			input: (cursor: string | undefined) => ({
				limit: pageSize,
				cursor,
				pending: view === "pending" ? true : undefined,
				saved: view === "saved" ? true : undefined,
				african: african ? true : undefined,
				language: language || undefined,
			}),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (page) => page.nextCursor ?? undefined,
			enabled: view === "recent" || signedIn,
		}),
	);
	const items = list.data?.pages.flatMap((page) => page.items) ?? [];

	return (
		<main className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
			<header className="grid gap-1">
				<h1 className="font-semibold text-2xl">{t("title")}</h1>
				<p className="text-muted-foreground">{t("intro")}</p>
			</header>

			<div className="flex flex-wrap items-center gap-2">
				{VIEWS.map((v) => (
					<Button
						key={v}
						size="sm"
						variant={v === view ? "default" : "outline"}
						aria-pressed={v === view}
						onClick={() =>
							v !== "recent" && !signedIn ? setSigningIn(true) : setView(v)
						}
					>
						{t(`views.${v}`)}
					</Button>
				))}
				<span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
				<Button
					size="sm"
					variant={african ? "default" : "outline"}
					aria-pressed={african}
					onClick={() => setAfrican((on) => !on)}
				>
					{t("african")}
				</Button>
				{(["fr", "en"] as const).map((l) => (
					<Button
						key={l}
						size="sm"
						variant={language === l ? "default" : "outline"}
						aria-pressed={language === l}
						onClick={() => setLanguage((now) => (now === l ? "" : l))}
					>
						{l.toUpperCase()}
					</Button>
				))}
			</div>

			{view === "pending" && (
				<p className="text-muted-foreground text-sm">{t("pendingHint")}</p>
			)}

			{list.isPending && (view === "recent" || signedIn) ? (
				<Skeleton className="h-40 rounded-2xl" />
			) : list.isError ? (
				<p className="text-muted-foreground text-sm">
					{t("error")}{" "}
					<Button variant="link" size="sm" onClick={() => list.refetch()}>
						{t("retry")}
					</Button>
				</p>
			) : items.length === 0 ? (
				<p className="text-muted-foreground">{t(`empty.${view}`)}</p>
			) : (
				<ul className="grid gap-3">
					{items.map((item) => (
						<li key={item.id}>
							<WatchCard
								item={item}
								signedIn={signedIn}
								onSignIn={() => setSigningIn(true)}
							/>
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

			<ProposeForm
				signedIn={signedIn}
				onSignIn={() => setSigningIn(true)}
				onDone={() => {
					setView("pending");
					queryClient.invalidateQueries({ queryKey: orpc.watch.list.key() });
				}}
			/>
			<SsoLoginDialog open={signingIn} onOpenChange={setSigningIn} />
		</main>
	);
}

function ProposeForm({
	signedIn,
	onSignIn,
	onDone,
}: {
	signedIn: boolean;
	onSignIn: () => void;
	onDone: () => void;
}) {
	const t = useTranslations("watch.propose");
	const [url, setUrl] = useState("");
	const [title, setTitle] = useState("");
	const [summary, setSummary] = useState("");
	const [tags, setTags] = useState("");
	const [language, setLanguage] = useState<"fr" | "en">("fr");
	const propose = useMutation(
		orpc.watch.submit.mutationOptions({
			onSuccess: () => {
				toast.success(t("done"));
				setUrl("");
				setTitle("");
				setSummary("");
				setTags("");
				onDone();
			},
			onError: (error) => {
				const code = errorCodeOf(error);
				toast.error(
					code === "PRIVILEGE_REQUIRED"
						? t("needReputation")
						: code === "CONFLICT"
							? t("exists")
							: code === "FORBIDDEN"
								? t("blocked")
								: code === "TOO_MANY_REQUESTS"
									? t("tooMany")
									: t("error"),
				);
			},
		}),
	);

	return (
		<section
			aria-labelledby="propose"
			className="grid gap-3 rounded-2xl border p-4"
		>
			<h2 id="propose" className="font-semibold text-lg">
				{t("title")}
			</h2>
			<p className="text-muted-foreground text-sm">{t("hint")}</p>
			<form
				className="grid gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (!signedIn) {
						onSignIn();
						return;
					}
					propose.mutate({
						url,
						title,
						summary,
						language,
						tags: tags
							.split(",")
							.map((tag) => tag.trim())
							.filter(Boolean)
							.slice(0, 5),
					});
				}}
			>
				<Input
					type="url"
					required
					value={url}
					onChange={(event) => setUrl(event.target.value)}
					aria-label={t("url")}
					placeholder="https://…"
				/>
				<Input
					required
					maxLength={200}
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					aria-label={t("titleLabel")}
					placeholder={t("titleLabel")}
				/>
				<Textarea
					maxLength={300}
					value={summary}
					onChange={(event) => setSummary(event.target.value)}
					aria-label={t("summary")}
					placeholder={t("summary")}
				/>
				<Input
					value={tags}
					onChange={(event) => setTags(event.target.value)}
					aria-label={t("tags")}
					placeholder={t("tags")}
				/>
				<div className="flex flex-wrap items-center gap-2">
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
					<Button type="submit" disabled={propose.isPending}>
						{t("submit")}
					</Button>
				</div>
			</form>
		</section>
	);
}
