"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@codesphere/ui/components/molecules/dropdown-menu";
import { CheckIcon, LinkIcon, Share2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { intentUrl, SHARE_TARGETS, shareUrl } from "@/lib/share";

/**
 * Share the current page (ADR 0001): the device's own share sheet when it has one, otherwise the
 * network links and "copy link". Links open the network's page; no third-party script is loaded.
 */
export function ShareMenu({ title }: { title: string }) {
	const t = useTranslations("share");
	const [copied, setCopied] = useState(false);
	// Computed on demand: during server render there is no location.
	const url = () => shareUrl(window.location.href);
	const canNativeShare =
		typeof navigator !== "undefined" && typeof navigator.share === "function";

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(url());
			setCopied(true);
			toast.success(t("copied"));
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error(t("copyFailed"));
		}
	};
	const native = async () => {
		try {
			await navigator.share({ title, url: url() });
		} catch {
			// Dismissing the sheet rejects: nothing to report.
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="outline" size="sm" aria-label={t("menu")}>
						<Share2Icon />
						{t("trigger")}
					</Button>
				}
			/>
			<DropdownMenuContent align="end">
				<DropdownMenuGroup>
					<DropdownMenuLabel>{t("menu")}</DropdownMenuLabel>
					{canNativeShare && (
						<DropdownMenuItem onClick={native}>
							<Share2Icon />
							{t("native")}
						</DropdownMenuItem>
					)}
					{SHARE_TARGETS.map((target) => (
						<DropdownMenuItem
							key={target}
							onClick={() =>
								window.open(
									intentUrl(target, { url: url(), text: title }),
									"_blank",
									"noopener,noreferrer",
								)
							}
						>
							{t(`targets.${target}`)}
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={copy}>
					{copied ? <CheckIcon /> : <LinkIcon />}
					{t("copy")}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
