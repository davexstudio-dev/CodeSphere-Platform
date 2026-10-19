"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import SsoLoginDialog from "@/components/sso-login-dialog";
import { errorCodeOf } from "@/i18n/errors";
import { authClient } from "@/lib/auth-client";
import { teamConflictReason } from "@/lib/team-errors";
import { orpc } from "@/utils/orpc";

/** Joins the Team of an invitation link after an explicit click: a link opened by a crawler does nothing. */
export function JoinTeam({ token }: { token: string }) {
	const t = useTranslations("hackathon.team.join");
	const router = useRouter();
	const { data: session } = authClient.useSession();
	const [signingIn, setSigningIn] = useState(false);
	const join = useMutation(
		orpc.teams.joinByLink.mutationOptions({
			onSuccess: (team) =>
				router.push(`/hackathons/${team.hackathonSlug}?tab=team` as never),
		}),
	);
	const reason = join.error ? teamConflictReason(join.error) : null;
	const code = join.error ? errorCodeOf(join.error) : null;
	return (
		<main className="mx-auto grid max-w-md gap-4 px-4 py-10">
			<h1 className="font-semibold text-2xl">{t("title")}</h1>
			<p className="text-muted-foreground">{t("intro")}</p>
			{code && (
				<p role="alert" className="text-destructive text-sm">
					{reason === "already_in_team"
						? t("already")
						: reason === "team_full"
							? t("full")
							: reason === "closed"
								? t("closed")
								: t("invalid")}
				</p>
			)}
			<Button
				className="w-fit"
				disabled={join.isPending}
				onClick={() => (session ? join.mutate({ token }) : setSigningIn(true))}
			>
				{t("button")}
			</Button>
			<SsoLoginDialog open={signingIn} onOpenChange={setSigningIn} />
		</main>
	);
}
