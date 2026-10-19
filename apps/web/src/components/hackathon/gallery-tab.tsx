"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { Tag } from "@codesphere/ui/components/atoms/tag";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { RenderedMarkdown } from "@/components/rendered-markdown";
import { orpc } from "@/utils/orpc";

/** The public gallery of frozen Submissions (#261): empty until the submission deadline. */
export function GalleryTab({ slug }: { slug: string }) {
	const t = useTranslations("hackathon.gallery");
	const gallery = useInfiniteQuery(
		orpc.teams.gallery.infiniteOptions({
			input: (cursor: string | undefined) => ({ slug, limit: 20, cursor }),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (page) => page.nextCursor ?? undefined,
		}),
	);
	const pages = gallery.data?.pages ?? [];
	const items = pages.flatMap((page) => page.items);
	if (gallery.isPending) {
		return null;
	}
	if (!pages[0]?.open) {
		return <p className="text-muted-foreground">{t("notYet")}</p>;
	}
	if (items.length === 0) {
		return <p className="text-muted-foreground">{t("empty")}</p>;
	}
	return (
		<section className="grid gap-4">
			{items.map((s) => (
				<article key={s.id} className="grid gap-2 rounded-2xl border p-4">
					<h3 className="font-semibold text-lg">{s.title}</h3>
					<p className="text-muted-foreground text-sm">
						{s.teamName} · {s.members.join(", ")}
					</p>
					<RenderedMarkdown html={s.descriptionHtml} />
					<p className="flex flex-wrap gap-3 text-sm">
						<a
							href={s.repoUrl}
							target="_blank"
							rel="noopener noreferrer nofollow"
							className="underline"
						>
							{t("repo")}
						</a>
						<a
							href={s.demoUrl}
							target="_blank"
							rel="noopener noreferrer nofollow"
							className="underline"
						>
							{t("demo")}
						</a>
						{s.videoUrl && (
							<a
								href={s.videoUrl}
								target="_blank"
								rel="noopener noreferrer nofollow"
								className="underline"
							>
								{t("video")}
							</a>
						)}
					</p>
					{s.tags.length > 0 && (
						<ul className="flex flex-wrap gap-1">
							{s.tags.map((tag) => (
								<li key={tag}>
									<Tag>{tag}</Tag>
								</li>
							))}
						</ul>
					)}
				</article>
			))}
			{gallery.hasNextPage && (
				<Button
					variant="outline"
					disabled={gallery.isFetchingNextPage}
					onClick={() => gallery.fetchNextPage()}
				>
					{t("more")}
				</Button>
			)}
		</section>
	);
}
