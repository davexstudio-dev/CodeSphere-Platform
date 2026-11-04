import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { WatchPage } from "@/components/watch/watch-page";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("watch");
	return { title: `${t("title")} · CodeSphere`, description: t("intro") };
}

// The watch feed (#255). Rendered in the browser.
export default function Page() {
	return <WatchPage />;
}
