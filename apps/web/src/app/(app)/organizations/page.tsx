import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import Link from "@/components/link";
import { client } from "@/utils/orpc";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("organizations");
	return { title: `${t("title")} · CodeSphere`, description: t("intro") };
}

// The validated Organizations (#257), server-rendered.
export default async function Page() {
	const t = await getTranslations("organizations");
	const page = await client.organizations.list({ limit: 50 }).catch(() => null);
	return (
		<main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 md:px-8">
			<header className="flex flex-col gap-2">
				<h1 className="font-semibold text-3xl">{t("title")}</h1>
				<p className="text-muted-foreground">{t("intro")}</p>
				<Link
					href="/organizations/new"
					className="w-fit rounded-full bg-primary px-4 py-2 font-medium text-primary-foreground text-sm"
				>
					{t("apply")}
				</Link>
			</header>
			{page === null ? (
				<p className="text-muted-foreground">{t("unavailable")}</p>
			) : page.items.length === 0 ? (
				<p className="text-muted-foreground">{t("empty")}</p>
			) : (
				<ul className="flex flex-col gap-3">
					{page.items.map((org) => (
						<li key={org.slug} className="rounded-2xl border p-4">
							<a
								href={`/organizations/${org.slug}`}
								className="font-semibold text-lg hover:underline"
							>
								{org.name}
							</a>
							<p className="text-muted-foreground text-sm">
								{org.country} · {new URL(org.website).hostname}
							</p>
						</li>
					))}
				</ul>
			)}
		</main>
	);
}
