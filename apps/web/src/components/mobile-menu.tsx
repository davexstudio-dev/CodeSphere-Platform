"use client";

import { isStaffRole } from "@codesphere/contract/roles";
import { Button } from "@codesphere/ui/components/atoms/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@codesphere/ui/components/molecules/dropdown-menu";
import {
	LogInIcon,
	LogOutIcon,
	MenuIcon,
	PlusIcon,
	SettingsIcon,
	ShieldIcon,
	UserIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { useSignOut } from "@/components/outbox-provider";
import SsoLoginDialog from "@/components/sso-login-dialog";
import { setLocale } from "@/i18n/actions";
import { isLocale } from "@/i18n/config";
import { backOfficeHome } from "@/lib/post-signin";
import { useHydratedSession } from "@/lib/use-hydrated-session";

/**
 * The site's bar on a phone (#129): one menu button gathers the language, « Poser une question »
 * and the account (« Se connecter » for a visitor), so the bar keeps only the logo, the theme and
 * this button. From `sm` up, the bar shows them inline instead.
 */
export function MobileMenu() {
	const t = useTranslations("header");
	const tMember = useTranslations("member");
	const router = useRouter();
	const locale = useLocale();
	const [, startTransition] = useTransition();
	const { data: session } = useHydratedSession();
	const signOut = useSignOut();
	const [signInOpen, setSignInOpen] = useState(false);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={<Button variant="ghost" size="icon" aria-label={t("menu")} />}
				>
					<MenuIcon />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="min-w-56 bg-card">
					{session && (
						<>
							<DropdownMenuGroup>
								<DropdownMenuLabel>
									<span className="block font-semibold text-foreground">
										{session.user.name || tMember("unnamed")}
									</span>
								</DropdownMenuLabel>
							</DropdownMenuGroup>
							<DropdownMenuSeparator />
						</>
					)}
					<DropdownMenuGroup>
						<DropdownMenuItem
							onClick={() =>
								session ? router.push("/ask") : setSignInOpen(true)
							}
						>
							<PlusIcon />
							{t("ask")}
						</DropdownMenuItem>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuLabel>{t("language")}</DropdownMenuLabel>
						<DropdownMenuRadioGroup
							value={locale}
							onValueChange={(value) => {
								if (typeof value === "string" && isLocale(value)) {
									startTransition(() => setLocale(value));
								}
							}}
						>
							<DropdownMenuRadioItem value="fr">Français</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
						</DropdownMenuRadioGroup>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					{session ? (
						<DropdownMenuGroup>
							<DropdownMenuItem
								onClick={() => router.push("/settings?tab=profile")}
							>
								<UserIcon />
								{t("profile")}
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => router.push("/settings")}>
								<SettingsIcon />
								{t("settings")}
							</DropdownMenuItem>
							{isStaffRole(session.user.role) && (
								<DropdownMenuItem
									onClick={() => router.push(backOfficeHome(session.user.role))}
								>
									<ShieldIcon />
									{t("admin")}
								</DropdownMenuItem>
							)}
							<DropdownMenuSeparator />
							<DropdownMenuItem
								variant="destructive"
								onClick={() => void signOut(() => router.push("/"))}
							>
								<LogOutIcon />
								{t("signOut")}
							</DropdownMenuItem>
						</DropdownMenuGroup>
					) : (
						<DropdownMenuGroup>
							<DropdownMenuItem onClick={() => setSignInOpen(true)}>
								<LogInIcon />
								{t("signIn")}
							</DropdownMenuItem>
						</DropdownMenuGroup>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
			{/* Outside the menu, so it stays open once the menu closes. */}
			{!session && (
				<SsoLoginDialog open={signInOpen} onOpenChange={setSignInOpen} />
			)}
		</>
	);
}
