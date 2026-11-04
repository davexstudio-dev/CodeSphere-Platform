"use client";

import {
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
} from "@codesphere/ui/components/molecules/dropdown-menu";
import { AdminUserMenu } from "@codesphere/ui/components/organisms/admin-user-menu";
import { ExternalLinkIcon, LogOutIcon, UserCogIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useTransition } from "react";

import { useAdminIdentity } from "@/components/admin-identity";
import Link from "@/components/link";
import { useSignOut } from "@/components/outbox-provider";
import { setLocale } from "@/i18n/actions";
import { isLocale } from "@/i18n/config";

/**
 * The staff badge at the bottom of the back-office sidebar (#286): who is signed in, their role, and the
 * menu of their account: « Mon compte », language and theme, back to the site, sign out.
 */
export default function AdminAccountMenu({ compact }: { compact: boolean }) {
	const t = useTranslations("admin.userMenu");
	const tRole = useTranslations("admin.staff.roles");
	const identity = useAdminIdentity();
	const locale = useLocale();
	const { theme, setTheme } = useTheme();
	const [pending, startTransition] = useTransition();
	const signOut = useSignOut();

	if (!identity) {
		return null;
	}
	const role = identity.role;
	return (
		<AdminUserMenu
			name={identity.name}
			email={identity.email}
			roleLabel={
				role === "super_admin" || role === "admin" || role === "moderator"
					? tRole(role)
					: tRole("member")
			}
			label={t("label")}
			compact={compact}
		>
			<DropdownMenuItem render={<Link href="/admin/account" />}>
				<UserCogIcon />
				{t("account")}
			</DropdownMenuItem>
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
					<DropdownMenuRadioItem
						closeOnClick
						value="fr"
						disabled={pending}
						lang="fr"
					>
						Français
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem
						closeOnClick
						value="en"
						disabled={pending}
						lang="en"
					>
						English
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuGroup>
			<DropdownMenuSeparator />
			<DropdownMenuGroup>
				<DropdownMenuLabel>{t("theme")}</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={theme ?? "system"}
					onValueChange={(value) => {
						if (typeof value === "string") {
							setTheme(value);
						}
					}}
				>
					<DropdownMenuRadioItem closeOnClick value="light">
						{t("themes.light")}
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem closeOnClick value="dark">
						{t("themes.dark")}
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem closeOnClick value="system">
						{t("themes.system")}
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuGroup>
			<DropdownMenuSeparator />
			<DropdownMenuItem render={<Link href="/" />}>
				<ExternalLinkIcon />
				{t("backToSite")}
			</DropdownMenuItem>
			<DropdownMenuItem
				variant="destructive"
				onClick={() => void signOut(() => window.location.assign("/"))}
			>
				<LogOutIcon />
				{t("signOut")}
			</DropdownMenuItem>
		</AdminUserMenu>
	);
}
