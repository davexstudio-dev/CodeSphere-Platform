"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@codesphere/ui/components/molecules/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useSignOut } from "@/components/outbox-provider";
import { PrivacyActions } from "@/components/settings/privacy-section";
import { errorCodeOf } from "@/i18n/errors";
import { HAS_DATABASE } from "@/lib/deployment";
import { legalHref } from "@/lib/legal";
import { useHydratedSession } from "@/lib/use-hydrated-session";
import { client, orpc } from "@/utils/orpc";

const CHECK_KEY = ["members", "consent-check"];

/**
 * The blocking screen of a new consent version (#341). When the terms or the privacy policy were
 * published with « modification importante », a Member who accepted an older version sees it on their
 * next page view, even if their session is days old. Four ways out: accept, sign out, delete the
 * account, download the data. The legal pages themselves stay readable, so the new texts can be read
 * before answering.
 */
export function ConsentGate() {
	const t = useTranslations("consent");
	const tErrors = useTranslations("errors");
	const pathname = usePathname();
	const queryClient = useQueryClient();
	const signOut = useSignOut();
	const { data: session } = useHydratedSession();
	const reading = pathname.startsWith("/legal/");
	const status = useQuery({
		// One check per page view: the pathname is part of the key.
		queryKey: [...CHECK_KEY, pathname],
		queryFn: () => client.members.consent({}),
		enabled: HAS_DATABASE && Boolean(session?.user) && !reading,
		staleTime: 0,
		retry: false,
		// A check that fails does not block the Member: the next page view asks again.
		meta: { silent: true },
	});
	const accept = useMutation(
		orpc.members.acceptConsent.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({ queryKey: CHECK_KEY });
			},
			onError: (error) => {
				toast.error(tErrors(errorCodeOf(error)));
				// The texts changed again meanwhile: ask for the new version.
				void queryClient.invalidateQueries({ queryKey: CHECK_KEY });
			},
		}),
	);

	const current = status.data;
	if (!current?.required || reading) {
		return null;
	}
	return (
		<Dialog open onOpenChange={() => undefined}>
			<DialogContent showCloseButton={false} className="max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("title")}</DialogTitle>
					<DialogDescription>
						{t("description", { version: current.current })}
					</DialogDescription>
				</DialogHeader>
				<ul className="grid gap-1 text-sm">
					{(["terms", "privacy"] as const).map((page) => (
						<li key={page}>
							<a
								href={legalHref(page)}
								target="_blank"
								rel="noreferrer"
								className="text-primary underline"
							>
								{t(page === "terms" ? "readTerms" : "readPrivacy")}
							</a>
						</li>
					))}
				</ul>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => void signOut(() => window.location.assign("/"))}
					>
						{t("signOut")}
					</Button>
					<Button
						disabled={accept.isPending}
						onClick={() => accept.mutate({ version: current.current })}
					>
						{t("accept")}
					</Button>
				</DialogFooter>
				<details className="grid gap-2 border-t pt-3 text-sm">
					<summary className="cursor-pointer text-muted-foreground">
						{t("otherOptions")}
					</summary>
					<PrivacyActions />
				</details>
			</DialogContent>
		</Dialog>
	);
}
