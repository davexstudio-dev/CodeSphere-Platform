import { parseAgentRules } from "@codesphere/api/agents/moderation";
import { parseFarmingLimits } from "@codesphere/api/reputation/farming";
import { parsePrivilegeThresholds } from "@codesphere/api/reputation/service";
import { postgresWriteQuota } from "@codesphere/api/write-quota";

import { createApp } from "./app";
import { ENV } from "./env.server";
import { createSentryReporter } from "./sentry";
import { auth, db, logger, notifications, social } from "./services";
import { startTelemetry } from "./telemetry";

const stopTelemetry = startTelemetry();
const reporter = createSentryReporter();
if (stopTelemetry || reporter) {
	// A SIGTERM listener replaces the default exit, so flush traces and error reports, then exit.
	process.once(
		"SIGTERM",
		() =>
			void Promise.allSettled([stopTelemetry?.(), reporter?.flush()]).finally(
				() => process.exit(0),
			),
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
	reporter,
	writeQuota: postgresWriteQuota(db),
	agentRules: parseAgentRules(ENV.AGENT_RULES),
	farmingLimits: parseFarmingLimits(ENV.FARMING_LIMITS),
	privilegeThresholds: parsePrivilegeThresholds(ENV.PRIVILEGE_THRESHOLDS),
});

export default app;
