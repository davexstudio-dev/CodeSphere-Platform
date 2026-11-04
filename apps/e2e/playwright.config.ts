import { defineConfig, devices } from "@playwright/test";

// The three journeys of #55, against a local stack: the API (apps/server) and the web app
// (apps/web) on a database migrated and seeded with `db:seed:test` (deterministic data).
//
//   DATABASE_URL=postgres://…/codesphere_test bun run e2e
//
// The web app runs `next dev` unless E2E_WEB_COMMAND says otherwise (CI: `next start` on a build
// made with the same NEXT_PUBLIC_* values as below). Locally, already running servers on the
// same ports are reused.
const SERVER_PORT = 3100;
const WEB_PORT = 3101;
export const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error(
		"DATABASE_URL is not set: the end-to-end tests need a test database.",
	);
}

export default defineConfig({
	testDir: "./tests",
	// Not *.test.ts / *.spec.ts: `bun test` would pick those up.
	testMatch: "**/*.e2e.ts",
	// The journeys share the seeded Member: one at a time.
	workers: 1,
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	timeout: 60_000,
	expect: { timeout: 15_000 },
	reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
	use: {
		baseURL: WEB_URL,
		locale: "fr-FR",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				// A Chromium already on the machine (sandboxes without `playwright install`).
				launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
					? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
					: {},
			},
		},
	],
	webServer: [
		{
			name: "api",
			command: "bun run src/index.ts",
			cwd: "../server",
			url: `${SERVER_URL}/api/v1/health`,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
			env: {
				NODE_ENV: "development",
				// Bun serves the default export on PORT.
				PORT: String(SERVER_PORT),
				LOG_LEVEL: "warn",
				DATABASE_URL: databaseUrl,
				BETTER_AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else",
				BETTER_AUTH_URL: SERVER_URL,
				CORS_ORIGIN: WEB_URL,
				// Sign-in by email code: the tests read the code from the database.
				EMAIL_OTP_SIGNIN: "true",
				// The back-office staff of the tests: the role is derived from these lists at sign-in.
				ADMIN_EMAILS: "e2e.admin@example.com",
				MODERATOR_EMAILS: "e2e.moderator@example.com",
				// The journeys test voting, not its guards: voters are accounts created minutes ago and
				// a down vote needs Reputation (#240, #241), so these are relaxed for the tests.
				PRIVILEGE_THRESHOLDS: '{"downvote":0,"submit_feed_item":0}',
				FARMING_LIMITS: '{"minAccountAgeDays":0}',
			},
		},
		{
			name: "web",
			command:
				process.env.E2E_WEB_COMMAND ?? `bunx next dev --port ${WEB_PORT}`,
			cwd: "../web",
			url: WEB_URL,
			reuseExistingServer: !process.env.CI,
			timeout: 180_000,
			env: {
				NEXT_PUBLIC_SERVER_URL: SERVER_URL,
				NEXT_PUBLIC_EMAIL_OTP_SIGNIN: "true",
				NEXT_PUBLIC_HAS_DATABASE: "true",
			},
		},
	],
});
