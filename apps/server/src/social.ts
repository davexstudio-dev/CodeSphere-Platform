import type { Context as ApiContext } from "@codesphere/api/context";
import { createSocialAccounts } from "@codesphere/api/social-accounts";
import type { Database } from "@codesphere/db";
import {
	createVault,
	type OAuthApp,
	publisherFromEnv,
	type SocialEnv,
} from "@codesphere/social";

export type SocialDepsEnv = SocialEnv & {
	SOCIAL_CREDENTIALS_SECRET?: string;
	PUBLIC_SITE_URL?: string;
	X_CLIENT_ID?: string;
	X_CLIENT_SECRET?: string;
	LINKEDIN_CLIENT_ID?: string;
	LINKEDIN_CLIENT_SECRET?: string;
};

const oauthApp = (
	clientId: string | undefined,
	clientSecret: string | undefined,
	extra: Partial<OAuthApp> = {},
): OAuthApp | undefined =>
	clientId
		? { clientId, ...(clientSecret ? { clientSecret } : {}), ...extra }
		: undefined;

/**
 * The official social accounts, for the Bun server and the Worker alike (#265, #266, #322). The
 * accounts an Admin connects are off unless the encryption secret, the site URL (the OAuth
 * callback) and an application's client id are all set. The publisher is null without any platform
 * credentials: the admin procedure then answers SERVICE_UNAVAILABLE.
 */
export function socialFromEnv(
	env: SocialDepsEnv,
	db: Database,
): NonNullable<ApiContext["social"]> {
	const xApp = oauthApp(env.X_CLIENT_ID, env.X_CLIENT_SECRET);
	const linkedinApp = oauthApp(
		env.LINKEDIN_CLIENT_ID,
		env.LINKEDIN_CLIENT_SECRET,
		{
			...(env.LINKEDIN_API_VERSION
				? { linkedinApiVersion: env.LINKEDIN_API_VERSION }
				: {}),
			...(env.LINKEDIN_AUTHOR ? { linkedinAuthor: env.LINKEDIN_AUTHOR } : {}),
		},
	);
	const accounts =
		env.SOCIAL_CREDENTIALS_SECRET &&
		env.PUBLIC_SITE_URL &&
		(xApp || linkedinApp)
			? createSocialAccounts({
					db,
					vault: createVault(env.SOCIAL_CREDENTIALS_SECRET),
					siteUrl: env.PUBLIC_SITE_URL,
					apps: {
						...(xApp ? { x: xApp } : {}),
						...(linkedinApp ? { linkedin: linkedinApp } : {}),
					},
				})
			: undefined;
	return {
		publisher: publisherFromEnv(env, {
			...(accounts ? { credentials: accounts.sources } : {}),
		}),
		...(env.PUBLIC_SITE_URL ? { siteUrl: env.PUBLIC_SITE_URL } : {}),
		...(accounts ? { accounts } : {}),
	};
}
