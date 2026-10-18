import { AppFooter } from "@codesphere/ui/components/organisms/app-footer";
import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Outfit } from "next/font/google";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

import "../index.css";
import Providers from "@/components/providers";
import { LEGAL_PAGES, legalHref } from "@/lib/legal";
import { publicPageUrl } from "@/lib/page-url";
import { OG_IMAGE_PATH, ogImage, SITE_NAME } from "@/lib/share";

// Google Fonts only (CADEV rule), self-hosted at build time by next/font.
const outfit = Outfit({
	subsets: ["latin", "latin-ext"],
	variable: "--font-outfit",
	display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
	subsets: ["latin", "latin-ext"],
	variable: "--font-jetbrains-mono",
	display: "swap",
});

const DESCRIPTION = "Plateforme d'échange pour développeurs africains";

// Generic card (home, unknown or unreadable pages): the page-level previews of Questions and
// Hackathons set their own `openGraph` and `twitter`, which replace these.
export async function generateMetadata(): Promise<Metadata> {
	const imageUrl = await publicPageUrl(OG_IMAGE_PATH);
	return {
		title: SITE_NAME,
		description: DESCRIPTION,
		openGraph: {
			type: "website",
			title: SITE_NAME,
			description: DESCRIPTION,
			siteName: SITE_NAME,
			images: [ogImage(imageUrl)],
		},
		twitter: {
			card: "summary_large_image",
			title: SITE_NAME,
			description: DESCRIPTION,
			images: [imageUrl],
		},
	};
}

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
};

export default async function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const locale = await getLocale();
	const messages = await getMessages();
	const t = await getTranslations("legal");
	// Drawn by src/proxy.ts for the CSP (#54).
	const nonce = (await headers()).get("x-nonce") ?? undefined;

	return (
		<html
			lang={locale}
			className={`${outfit.variable} ${jetbrainsMono.variable}`}
			suppressHydrationWarning
		>
			<body>
				<NextIntlClientProvider locale={locale} messages={messages}>
					<Providers nonce={nonce}>
						{children}
						<AppFooter
							version={process.env.APP_VERSION ?? "0.0.0"}
							sha={process.env.GIT_SHA ?? "dev"}
							navLabel={t("nav")}
							links={LEGAL_PAGES.map((page) => ({
								label: t(`pages.${page}.title`),
								href: legalHref(page),
							}))}
						/>
					</Providers>
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
