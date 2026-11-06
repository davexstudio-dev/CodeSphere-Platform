"use client";

import { LoginDialog } from "@codesphere/ui/components/organisms/login-dialog";

import { useConsentVersion } from "@/lib/use-consent-version";
import { useSsoSignIn } from "@/lib/use-sso-sign-in";

/**
 * The SSO LoginDialog wired to Better Auth; `trigger` is the element that opens it. With `open`
 * and `onOpenChange` instead, it has no trigger and is opened from elsewhere (the phone menu).
 */
export default function SsoLoginDialog({
	trigger,
	open,
	onOpenChange,
}: {
	trigger?: React.ReactElement;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}) {
	const { pending, error, onProviderSelect, emailSignIn, lastUsedMethod } =
		useSsoSignIn();
	const consentVersion = useConsentVersion();
	return (
		<LoginDialog
			trigger={trigger}
			open={open}
			onOpenChange={onOpenChange}
			withoutTrigger={open !== undefined && !trigger}
			consentVersion={consentVersion}
			pendingProvider={pending}
			error={error}
			onProviderSelect={onProviderSelect}
			emailSignIn={emailSignIn}
			lastUsedMethod={lastUsedMethod}
		/>
	);
}
