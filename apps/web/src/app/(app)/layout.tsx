import { AppFooter } from "@codesphere/ui/components/organisms/app-footer";
import { getTranslations } from "next-intl/server";

import { DataSaverToggle } from "@/components/data-saver";
import { NetworkBanner } from "@/components/network-banner";
import SiteHeader from "@/components/site-header";
import { LEGAL_PAGES, legalHref } from "@/lib/legal";

// Pages of the application share the site's bar (#129) and its footer. Standalone pages such as
// /design-system, /signin and /admin live outside this group and render without either: the
// footer, with its version and its public links, has no place in the back-office, the sign-in
// form or the component reference.
export default async function AppLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const t = await getTranslations("legal");
	const roadmap = await getTranslations("roadmap");
	const footer = await getTranslations("footer");
	return (
		<>
			<div className="min-h-svh">
				<SiteHeader />
				<NetworkBanner />
				{children}
			</div>
			{/* The data saver switch (#250) of the visitor pages; the back-office has it in « Mon compte ». */}
			<DataSaverToggle />
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
		</>
	);
}
