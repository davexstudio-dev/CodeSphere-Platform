import { Skeleton } from "@codesphere/ui/components/atoms/skeleton";
import type { Metadata } from "next";
import { Suspense } from "react";

import { HackathonPage } from "@/components/hackathon/hackathon-page";
import { publicPageUrl } from "@/lib/page-url";
import { previewMetadata } from "@/lib/share";
import { client } from "@/utils/orpc";

// Link preview (ADR 0001). Unknown or unreadable: the site's generic metadata.
export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>;
}): Promise<Metadata> {
	const { slug } = await params;
	try {
		const hackathon = await client.hackathons.get({ slug });
		return previewMetadata({
			title: hackathon.name,
			description: hackathon.summary,
			url: await publicPageUrl(`/hackathons/${encodeURIComponent(slug)}`),
			imageUrl: await publicPageUrl(
				`/og/hackathons/${encodeURIComponent(slug)}`,
			),
		});
	} catch {
		return {};
	}
}

// A Hackathon in tabs (#45). Rendered in the browser; `?tab=` keeps the open tab in the URL.
export default async function Page({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	return (
		<Suspense
			fallback={
				<main className="mx-auto max-w-5xl px-4 py-8">
					<Skeleton className="h-96 rounded-3xl" />
				</main>
			}
		>
			<HackathonPage slug={slug} />
		</Suspense>
	);
}
