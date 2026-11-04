import { createAuth } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { createLogger } from "@codesphere/logger";

import { ENV } from "./env.server";
import { createMailHooks, createNotifications } from "./mail";
import { socialFromEnv } from "./social";

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

export const social = socialFromEnv(ENV, db);
