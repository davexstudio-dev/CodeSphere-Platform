"use client";

import { CONSENT_VERSION } from "@codesphere/contract/consent";
import { LoginPage } from "@codesphere/ui/components/organisms/login-page";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import Link from "@/components/link";

import { signInErrorKey } from "@/lib/sign-in-error";
import { useSsoSignIn } from "@/lib/use-sso-sign-in";

// SSO sign-in form (spec §3: GitHub, GitLab, Google; consent unchecked at first sign-in).
export default function SignInForm() {
	const t = useTranslations("signin");
	const tHeader = useTranslations("header");
	const { pending, error, setError, onProviderSelect, emailSignIn } =
		useSsoSignIn();

	// A failed OAuth callback comes back here with `?error=<code>`.
	useEffect(() => {
		const key = signInErrorKey(
			new URLSearchParams(window.location.search).get("error"),
		);
		if (key) {
			setError(t(key));
		}
	}, [t, setError]);

	return (
		<LoginPage
			LinkComponent={Link}
			homeLabel={tHeader("home")}
			card={{
				consentVersion: CONSENT_VERSION,
				pendingProvider: pending,
				error,
				onProviderSelect,
				emailSignIn,
			}}
		/>
	);
}
