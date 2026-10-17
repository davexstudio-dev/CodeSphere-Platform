import { createApp } from "./app";
import { ENV } from "./env.server";
import { auth, db, logger, notifications, social } from "./services";
import { startTelemetry } from "./telemetry";

const stopTelemetry = startTelemetry();
if (stopTelemetry) {
	// A SIGTERM listener replaces the default exit, so flush traces then exit explicitly.
	process.once(
		"SIGTERM",
		() => void stopTelemetry().finally(() => process.exit(0)),
	);
}

const app = createApp({
	auth,
	db,
	logger,
	corsOrigin: ENV.CORS_ORIGIN,
	trustProxy: ENV.TRUST_PROXY,
	release: { version: ENV.APP_VERSION, commit: ENV.GIT_SHA },
	apiDocs: ENV.NODE_ENV !== "production",
	notifications,
	social,
	resendWebhookSecret: ENV.RESEND_WEBHOOK_SECRET,
});

export default app;
