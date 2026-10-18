// Writes the secrets of a pull request preview to a JSON file for `wrangler preview
// --secrets-file`. Reads the environment, skips what is unset, never prints a value.
import { writeFileSync } from "node:fs";

const KEYS = [
	"DATABASE_URL",
	"BETTER_AUTH_SECRET",
	"OAUTH_PROXY_SECRET",
	"GITHUB_CLIENT_ID",
	"GITHUB_CLIENT_SECRET",
	"GITLAB_CLIENT_ID",
	"GITLAB_CLIENT_SECRET",
	"GOOGLE_CLIENT_ID",
	"GOOGLE_CLIENT_SECRET",
	// Only the staging workflow exports them: previews send no email.
	"RESEND_API_KEY",
	"RESEND_WEBHOOK_SECRET",
	// Not a secret, but "Name <address>" cannot go on the command line: opennextjs-cloudflare
	// re-runs wrangler through /bin/sh, which reads the "<" as a redirection.
	"EMAIL_FROM",
	// Official social accounts (#265, #266): only the staging workflow exports them. The OAuth
	// client ids and the LinkedIn settings are not secret but travel the same way, so an unset
	// one is simply left out instead of being sent as an empty string.
	"SOCIAL_CREDENTIALS_SECRET",
	"X_CLIENT_ID",
	"X_CLIENT_SECRET",
	"LINKEDIN_CLIENT_ID",
	"LINKEDIN_CLIENT_SECRET",
	"LINKEDIN_API_VERSION",
	"LINKEDIN_AUTHOR",
	"BLUESKY_IDENTIFIER",
	"BLUESKY_APP_PASSWORD",
];

// DATABASE_URL is optional: a preview without the `preview-db` label has no database (#150).
const REQUIRED = ["BETTER_AUTH_SECRET"];

const target = process.argv[2];
if (!target) {
	console.error("usage: preview-secrets.mjs <output.json>");
	process.exit(2);
}

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
	console.error(`missing required secrets: ${missing.join(", ")}`);
	process.exit(1);
}

const secrets = Object.fromEntries(
	KEYS.filter((key) => process.env[key]).map((key) => [key, process.env[key]]),
);

writeFileSync(target, JSON.stringify(secrets), { mode: 0o600 });
console.log(`wrote ${Object.keys(secrets).length} secrets`);
