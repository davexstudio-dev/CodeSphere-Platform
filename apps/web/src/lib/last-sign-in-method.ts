import type { SsoProvider } from "@codesphere/ui/components/molecules/provider-button";
/** Maps Better Auth's last-login-method cookie to a method the sign-in card shows. */
export function toSignInMethod(
	value: string | null,
): SsoProvider | "email" | null {
	if (value === "github" || value === "gitlab" || value === "google") {
		return value;
	}
	return value?.startsWith("email") ? "email" : null;
}
