import { createAuth } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { createLogger } from "@codesphere/logger";
import { publisherFromEnv } from "@codesphere/social";

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

// Null without Bluesky credentials: the admin procedure then answers SERVICE_UNAVAILABLE (#265).
export const social = {
	publisher: publisherFromEnv(ENV),
	siteUrl: ENV.PUBLIC_SITE_URL,
};
