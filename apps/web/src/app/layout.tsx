import { AppFooter } from "@codesphere/ui/components/organisms/app-footer";
import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Outfit } from "next/font/google";
import { cookies, headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

import "../index.css";
import { DataSaver, DataSaverToggle } from "@/components/data-saver";
import Providers from "@/components/providers";
import { BRAND } from "@/lib/brand";
import {
	DATA_SAVER_COOKIE,
	parsePreference,
	resolveDataSaver,
} from "@/lib/data-saver";
import { LEGAL_PAGES, legalHref } from "@/lib/legal";
import { publicPageUrl } from "@/lib/page-url";
import { OG_IMAGE_PATH, ogImage, SITE_NAME } from "@/lib/share";

// Google Fonts only (CADEV rule), self-hosted at build time by next/font.
const outfit = Outfit({
	subsets: ["latin", "latin-ext"],
	variable: "--font-outfit",
	display: "swap",
	// No preload: Next sends it as a Link header on every response, which data saver mode (#250)
	// cannot turn off per request. The files load when the first text uses them.
	preload: false,
});
const jetbrainsMono = JetBrains_Mono({
	subsets: ["latin", "latin-ext"],
	variable: "--font-jetbrains-mono",
	display: "swap",
	preload: false,
});

const DESCRIPTION = "Plateforme d'échange pour développeurs africains";

// Generic card (home, unknown or unreadable pages): the page-level previews of Questions and
// Hackathons set their own `openGraph` and `twitter`, which replace these.
export async function generateMetadata(): Promise<Metadata> {
	const imageUrl = await publicPageUrl(OG_IMAGE_PATH);
	return {
		title: SITE_NAME,
		description: DESCRIPTION,
		icons: {
			icon: [
				{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
				{ url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
			],
			apple: "/icons/apple-touch-icon.png",
		},
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
	// The address bar of the installed app: the brand colour, and the dark background in dark mode.
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: BRAND.primary },
		{ media: "(prefers-color-scheme: dark)", color: BRAND.darkBackground },
	],
};

export default async function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const locale = await getLocale();
	const messages = await getMessages();
	const t = await getTranslations("legal");
	const roadmap = await getTranslations("roadmap");
	const footer = await getTranslations("footer");
	// Drawn by src/proxy.ts for the CSP (#54).
	const requestHeaders = await headers();
	const nonce = requestHeaders.get("x-nonce") ?? undefined;
	// Data saver mode (#250): the Member's choice, else the browser's Save-Data header. System fonts
	// only in this mode: the font classes are not applied, so the font files are never requested.
	const preference = parsePreference(
		(await cookies()).get(DATA_SAVER_COOKIE)?.value,
	);
	const dataSaver = resolveDataSaver(
		preference,
		requestHeaders.get("save-data"),
	);

	return (
		<html
			lang={locale}
			className={
				dataSaver ? undefined : `${outfit.variable} ${jetbrainsMono.variable}`
			}
			data-data-saver={dataSaver ? "true" : undefined}
			suppressHydrationWarning
		>
			<body>
				<NextIntlClientProvider locale={locale} messages={messages}>
					<DataSaver active={dataSaver} preference={preference}>
						<Providers nonce={nonce}>
							{children}
							<AppFooter
								version={process.env.APP_VERSION ?? "0.0.0"}
								sha={process.env.GIT_SHA ?? "dev"}
								navLabel={footer("nav")}
								links={[
									...LEGAL_PAGES.map((page) => ({
										label: t(`pages.${page}.title`),
										href: legalHref(page),
									})),
									{ label: footer("watch"), href: "/watch" },
									{ label: footer("jobs"), href: "/jobs" },
									{ label: footer("organizations"), href: "/organizations" },
									{ label: roadmap("nav"), href: "/roadmap" },
								]}
							/>
							<DataSaverToggle />
						</Providers>
					</DataSaver>
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
