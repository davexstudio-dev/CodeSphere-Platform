import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { CountryLabel } from "@/components/country-flag";
import { client } from "@/utils/orpc";

type Params = { params: Promise<{ slug: string }> };

const profileOf = (slug: string) =>
	client.organizations.get({ slug }).catch(() => null);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
	const { slug } = await params;
	const org = await profileOf(slug);
	return org
		? {
				title: `${org.name} · CodeSphere`,
				description: org.description || undefined,
			}
		: {};
}

// The public profile of a validated Organization (#257): name, website, country. Its contact
// email is never shown.
export default async function Page({ params }: Params) {
	const { slug } = await params;
	const org = await profileOf(slug);
	if (!org) {
		notFound();
	}
	const t = await getTranslations("organizations");
	const format = await getFormatter();
	return (
		<main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 md:px-8">
			<header className="flex flex-col gap-2">
				<h1 className="font-semibold text-3xl">{org.name}</h1>
				<p className="text-muted-foreground text-sm">
					{t("validated")}
					{org.validatedAt &&
						` · ${format.dateTime(new Date(org.validatedAt), { dateStyle: "long" })}`}
				</p>
			</header>
			{org.description && <p>{org.description}</p>}
			<dl className="grid gap-3 sm:grid-cols-2">
				<div className="rounded-2xl border p-4">
					<dt className="text-muted-foreground text-sm">{t("website")}</dt>
					<dd>
						<a
							href={org.website}
							target="_blank"
							rel="noopener noreferrer nofollow"
							className="hover:underline"
						>
							{new URL(org.website).hostname}
						</a>
					</dd>
				</div>
				<div className="rounded-2xl border p-4">
					<dt className="text-muted-foreground text-sm">{t("country")}</dt>
					<dd>
						<CountryLabel code={org.country} />
					</dd>
				</div>
			</dl>
		</main>
	);
}
