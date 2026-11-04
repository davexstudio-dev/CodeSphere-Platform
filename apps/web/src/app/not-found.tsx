import { Button } from "@codesphere/ui/components/atoms/button";
import { Dithering404 } from "@codesphere/ui/components/organisms/dithering-404";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import Link from "@/components/link";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("notFound");
	return { title: t("title"), robots: { index: false } };
}

/** Any address that leads nowhere, inside or outside the app's sections. */
export default async function NotFound() {
	const t = await getTranslations("notFound");
	return (
		<main>
			<Dithering404
				eyebrow={t("eyebrow")}
				title={t("title")}
				description={t("description")}
				actions={
					<>
						<Button render={<Link href="/" />} nativeButton={false}>
							{t("home")}
						</Button>
						<Button
							variant="secondary"
							render={<Link href="/ask" />}
							nativeButton={false}
						>
							{t("ask")}
						</Button>
					</>
				}
			/>
		</main>
	);
}
