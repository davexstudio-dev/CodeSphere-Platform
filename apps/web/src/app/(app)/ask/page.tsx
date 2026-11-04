"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { Skeleton } from "@codesphere/ui/components/atoms/skeleton";
import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { AskForm } from "@/components/ask/ask-form";
import SsoLoginDialog from "@/components/sso-login-dialog";
import { useHydratedSession } from "@/lib/use-hydrated-session";

// « Poser une question » (#68). A visitor is asked to sign in first.
export default function AskPage() {
	const t = useTranslations("ask");
	const { data: session, isPending } = useHydratedSession();
	// grid-cols-1: the step labels would otherwise widen the column past a phone screen.
	return (
		<main className="mx-auto grid max-w-3xl grid-cols-1 gap-6 px-4 py-6 md:px-6 md:py-8">
			<header className="grid gap-1">
				<h1 className="font-bold text-2xl tracking-tight">{t("title")}</h1>
				<p className="text-muted-foreground">{t("lead")}</p>
			</header>
			{isPending ? (
				<Skeleton className="h-96 rounded-3xl" />
			) : session ? (
				// useSearchParams (the ?tag= prefill) needs a Suspense boundary.
				<Suspense fallback={<Skeleton className="h-96 rounded-3xl" />}>
					<AskForm />
				</Suspense>
			) : (
				<div className="grid justify-items-start gap-3 rounded-3xl border border-border border-dashed p-6">
					<p className="text-muted-foreground">{t("signInFirst")}</p>
					<SsoLoginDialog trigger={<Button>{t("signIn")}</Button>} />
				</div>
			)}
		</main>
	);
}
