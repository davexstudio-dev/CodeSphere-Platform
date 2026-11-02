import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { RenderedMarkdown } from "@/components/rendered-markdown";
import { HAS_DATABASE } from "@/lib/deployment";
import {
	isLegalPage,
	LEGAL_PAGES,
	type LegalPage,
	legalHref,
	REPOSITORY_LEGAL_DATE,
} from "@/lib/legal";
import { client } from "@/utils/orpc";

type Section = { title: string; body: string };

// Read per request (#341): the latest published version, not a page built at deploy time. There is
// no incremental cache on the Worker, so nothing is revalidated; next.config.ts lets a browser keep
// the page for a few minutes.
export const dynamic = "force-dynamic";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ page: string }>;
}): Promise<Metadata> {
	const { page } = await params;
	if (!isLegalPage(page)) return {};
	const t = await getTranslations("legal.pages");
	return { title: `${t(`${page}.title`)} · CodeSphere` };
}

/**
 * The version in force in the reader's language, or null: nothing published in that language, no
 * database in this deployment, or the API cannot answer. The page then shows the text of the repository.
 */
async function readPublished(page: LegalPage, language: "fr" | "en") {
	if (!HAS_DATABASE) return null;
	try {
		return await client.legal.get({ document: page, language });
	} catch (error) {
		// Still show the repository text, but leave a trace: an outage must not pass unnoticed.
		console.error("legal.get failed, showing the repository text", error);
		return null;
	}
}

// Terms, privacy policy, legal notice and contact, in the reader's language (#56).
export default async function Page({
	params,
}: {
	params: Promise<{ page: string }>;
}) {
	const { page } = await params;
	if (!isLegalPage(page)) notFound();

	const t = await getTranslations("legal");
	const format = await getFormatter();
	const locale = await getLocale();
	const published = await readPublished(page, locale === "en" ? "en" : "fr");
	// Raw so the bodies are not parsed as ICU messages.
	const sections = t.raw(`pages.${page}.sections`) as Record<string, Section>;
	const updatedAt = published
		? new Date(published.publishedAt)
		: new Date(REPOSITORY_LEGAL_DATE);

	return (
		<main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 md:px-8">
			<nav aria-label={t("nav")}>
				<ul className="flex flex-wrap gap-4 text-sm">
					{LEGAL_PAGES.map((other) => (
						<li key={other}>
							<a
								href={legalHref(other)}
								aria-current={other === page ? "page" : undefined}
								className="text-muted-foreground hover:text-foreground hover:underline aria-[current=page]:font-medium aria-[current=page]:text-foreground"
							>
								{t(`pages.${other}.title`)}
							</a>
						</li>
					))}
				</ul>
			</nav>

			<header className="flex flex-col gap-2">
				<h1 className="font-semibold text-3xl tracking-tight">
					{t(`pages.${page}.title`)}
				</h1>
				<p className="text-muted-foreground text-sm">
					{t("updated", {
						date: format.dateTime(updatedAt, { dateStyle: "long" }),
					})}
				</p>
				{!published && (
					<>
						<p className="text-muted-foreground">{t(`pages.${page}.intro`)}</p>
						<p className="rounded-md border border-dashed px-3 py-2 text-muted-foreground text-xs">
							{t("draft")}
						</p>
					</>
				)}
			</header>

			{published ? (
				<RenderedMarkdown
					html={published.html}
					className="text-base [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:font-semibold [&_h2]:text-xl [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-lg [&_p]:leading-relaxed"
				/>
			) : (
				Object.entries(sections).map(([key, section]) => (
					<section key={key} className="flex flex-col gap-3">
						<h2 className="font-semibold text-xl">{section.title}</h2>
						{section.body.split("\n\n").map((paragraph) => (
							<p key={paragraph} className="leading-relaxed">
								{paragraph}
							</p>
						))}
					</section>
				))
			)}
		</main>
	);
}
