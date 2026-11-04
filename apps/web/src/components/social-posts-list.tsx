"use client";

import { Badge } from "@codesphere/ui/components/atoms/badge";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";

import { publicationTone } from "@/lib/admin-social";
import { orpc } from "@/utils/orpc";

const REFRESH_MS = 5000;

/** What became of the latest posts (#265): they leave through the outbox, after the click. */
export function SocialPostsList() {
	const t = useTranslations("admin.social");
	const tp = useTranslations("admin.social.posts");
	const format = useFormatter();
	const posts = useQuery({
		...orpc.admin.social.posts.queryOptions({ input: {} }),
		refetchInterval: (query) =>
			query.state.data?.items.some((post) => post.state === "pending")
				? REFRESH_MS
				: false,
	});
	const items = posts.data?.items ?? [];
	if (items.length === 0) {
		return null;
	}
	return (
		<section
			aria-labelledby="social-posts-title"
			className="flex flex-col gap-3 rounded-xl border bg-card p-4"
		>
			<h2 id="social-posts-title" className="font-medium">
				{tp("title")}
			</h2>
			<ul className="flex flex-col divide-y">
				{items.map((post) => (
					<li
						key={`${post.type}:${post.id}:${post.platform}`}
						className="flex flex-col gap-1 py-2 text-sm"
					>
						<div className="flex flex-wrap items-center gap-2">
							<Badge
								variant={
									publicationTone(post.state) === "destructive"
										? "destructive"
										: "secondary"
								}
							>
								{tp(`states.${post.state}`)}
							</Badge>
							<span className="text-muted-foreground text-xs">
								{t(`platforms.${post.platform}`)} ·{" "}
								{format.dateTime(new Date(post.updatedAt), {
									dateStyle: "medium",
									timeStyle: "short",
								})}
							</span>
						</div>
						<p className="break-words">{post.text}</p>
						{post.postUrl && (
							<a
								href={post.postUrl}
								target="_blank"
								rel="noreferrer"
								className="text-xs underline"
							>
								{t("publish.viewPost")}
							</a>
						)}
						{post.message && (
							<p className="text-muted-foreground text-xs">{post.message}</p>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}
