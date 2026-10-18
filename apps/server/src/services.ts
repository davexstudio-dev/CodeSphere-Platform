import { createSocialAccounts } from "@codesphere/api/social-accounts";
import { createAuth } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { createLogger } from "@codesphere/logger";
import {
	createVault,
	type OAuthApp,
	publisherFromEnv,
} from "@codesphere/social";

import { ENV } from "./env.server";
import { createMailHooks, createNotifications } from "./mail";

export const db = createDb(ENV);
export const logger = createLogger({
	level: ENV.LOG_LEVEL,
	pretty: ENV.NODE_ENV === "development",
});
export const notifications = createNotifications(ENV, logger);
export const auth = createAuth(
	ENV,
	db,
	[],
	createMailHooks(ENV, logger, ENV.NODE_ENV === "development"),
);

// The official X and LinkedIn accounts an Admin connects (#266): off unless the encryption secret,
// the site URL (the OAuth callback) and an application's client id are all set.
const oauthApp = (
	clientId: string | undefined,
	clientSecret: string | undefined,
	extra: Partial<OAuthApp> = {},
): OAuthApp | undefined =>
	clientId
		? { clientId, ...(clientSecret ? { clientSecret } : {}), ...extra }
		: undefined;

const xApp = oauthApp(ENV.X_CLIENT_ID, ENV.X_CLIENT_SECRET);
const linkedinApp = oauthApp(
	ENV.LINKEDIN_CLIENT_ID,
	ENV.LINKEDIN_CLIENT_SECRET,
	{
		...(ENV.LINKEDIN_API_VERSION
			? { linkedinApiVersion: ENV.LINKEDIN_API_VERSION }
			: {}),
		...(ENV.LINKEDIN_AUTHOR ? { linkedinAuthor: ENV.LINKEDIN_AUTHOR } : {}),
	},
);

export const socialAccounts =
	ENV.SOCIAL_CREDENTIALS_SECRET && ENV.PUBLIC_SITE_URL && (xApp || linkedinApp)
		? createSocialAccounts({
				db,
				vault: createVault(ENV.SOCIAL_CREDENTIALS_SECRET),
				siteUrl: ENV.PUBLIC_SITE_URL,
				apps: {
					...(xApp ? { x: xApp } : {}),
					...(linkedinApp ? { linkedin: linkedinApp } : {}),
				},
			})
		: undefined;

// Null without any platform credentials: the admin procedure then answers SERVICE_UNAVAILABLE (#265).
export const social = {
	publisher: publisherFromEnv(ENV, {
		...(socialAccounts ? { credentials: socialAccounts.sources } : {}),
	}),
	siteUrl: ENV.PUBLIC_SITE_URL,
	...(socialAccounts ? { accounts: socialAccounts } : {}),
};
