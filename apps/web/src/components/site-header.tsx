"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { ThemeToggle } from "@codesphere/ui/components/molecules/theme-toggle";
import { AppHeader } from "@codesphere/ui/components/organisms/app-header";
import { MapIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "@/components/link";

import LocaleSwitcher from "@/components/locale-switcher";
import { MobileMenu } from "@/components/mobile-menu";
import SsoLoginDialog from "@/components/sso-login-dialog";
import UserMenu from "@/components/user-menu";
import { useHydratedSession } from "@/lib/use-hydrated-session";

/** « Poser une question »: opens the sign-in for a visitor, the ask form (#68) for a Member. */
export function AskButton({ className }: { className?: string }) {
	const t = useTranslations("header");
	const { data: session } = useHydratedSession();
	const content = (
		<>
			<PlusIcon />
			<span className="max-sm:sr-only">{t("ask")}</span>
		</>
	);
	if (!session) {
		return (
			<SsoLoginDialog
				trigger={<Button className={className}>{content}</Button>}
			/>
		);
	}
	return (
		<Button
			className={className}
			render={<Link href="/ask" />}
			nativeButton={false}
		>
			{content}
		</Button>
	);
}

/**
 * The site's bar (#129): logo, theme, language, « Poser une question », then the account. On a
 * phone only the logo, the theme and a menu holding the rest. No feed tabs here.
 */
export default function SiteHeader() {
	const t = useTranslations("header");
	return (
		<AppHeader
			LinkComponent={Link}
			homeLabel={t("home")}
			actions={
				<>
					<ThemeToggle aria-label={t("toggleTheme")} />
					{/* From `sm` up, everything inline; on a phone, one menu holds the rest. */}
					<div className="flex items-center gap-3 max-sm:hidden">
						<LocaleSwitcher />
						{/* The public roadmap (#252): what is shipped and what comes next. */}
						<Button
							variant="ghost"
							render={<Link href="/roadmap" />}
							nativeButton={false}
						>
							<MapIcon />
							<span className="max-md:sr-only">{t("roadmap")}</span>
						</Button>
						<AskButton />
						<UserMenu />
					</div>
					<div className="sm:hidden">
						<MobileMenu />
					</div>
				</>
			}
		/>
	);
}
