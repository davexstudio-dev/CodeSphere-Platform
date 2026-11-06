"use client";

import { CONSENT_COOKIE } from "@codesphere/contract/consent";
import type { SsoProvider } from "@codesphere/ui/components/molecules/provider-button";
import type { EmailSignIn } from "@codesphere/ui/components/organisms/login-card";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { toSignInMethod } from "@/lib/last-sign-in-method";

// The consent version travels in a short-lived cookie that the server reads when it creates the
// account (#63): without it, no account is created.
const CONSENT_COOKIE_MAX_AGE_SECONDS = 600;

/**
 * SSO sign-in shared by /signin and the header's LoginDialog. Every success lands on
 * /post-signin, which sends an Admin to /admin and any other Member home (#121).
 */
export function useSsoSignIn(initialError?: string) {
	const t = useTranslations("signin");
	const [pending, setPending] = useState<SsoProvider | null>(null);
	const [error, setError] = useState<string | undefined>(initialError);
	// Read after mount: the cookie is only on the client, and the server render must match.
	const [lastUsedMethod, setLastUsedMethod] = useState<
		SsoProvider | "email" | null
	>(null);
	useEffect(() => {
		setLastUsedMethod(toSignInMethod(authClient.getLastUsedLoginMethod()));
	}, []);

	const onProviderSelect = async (
		provider: SsoProvider,
		consent: { version: string },
	) => {
		document.cookie = `${CONSENT_COOKIE}=${consent.version}; path=/; max-age=${CONSENT_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
		setError(undefined);
		setPending(provider);
		try {
			const { error: authError } = await authClient.signIn.social({
				provider,
				callbackURL: "/post-signin",
				errorCallbackURL: "/signin",
			});
			if (authError) {
				setError(authError.message ?? t("failed"));
				setPending(null);
			}
		} catch {
			setError(t("unreachable"));
			setPending(null);
		}
	};

	// Email code sign-in (local development, previews): same consent cookie, same landing.
	const emailSignIn: EmailSignIn | undefined =
		process.env.NEXT_PUBLIC_EMAIL_OTP_SIGNIN === "true"
			? {
					onRequestCode: async (email, consent) => {
						document.cookie = `${CONSENT_COOKIE}=${consent.version}; path=/; max-age=${CONSENT_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
						try {
							const { error: otpError } =
								await authClient.emailOtp.sendVerificationOtp({
									email,
									type: "sign-in",
								});
							return otpError ? (otpError.message ?? t("failed")) : undefined;
						} catch {
							return t("unreachable");
						}
					},
					onVerifyCode: async (email, code) => {
						try {
							const { error: otpError } = await authClient.signIn.emailOtp({
								email,
								otp: code,
							});
							if (otpError) {
								return otpError.message ?? t("failed");
							}
							window.location.assign("/post-signin");
							return undefined;
						} catch {
							return t("unreachable");
						}
					},
				}
			: undefined;

	return {
		pending,
		error,
		setError,
		onProviderSelect,
		emailSignIn,
		lastUsedMethod,
	};
}
