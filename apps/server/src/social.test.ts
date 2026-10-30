/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import type { Database } from "@codesphere/db";

import { socialFromEnv } from "./social";

const SECRET = "s".repeat(32);
const SITE = "https://staging.example";
// Nothing here reaches the database: only the configuration is under test.
const db = {} as Database;

describe("the official social accounts from the environment (#322)", () => {
	test("the secret, the site and a client id let an Admin connect that platform", () => {
		const social = socialFromEnv(
			{
				SOCIAL_CREDENTIALS_SECRET: SECRET,
				PUBLIC_SITE_URL: SITE,
				LINKEDIN_CLIENT_ID: "client",
				LINKEDIN_CLIENT_SECRET: "client-secret",
			},
			db,
		);
		expect(social.accounts).toBeDefined();
		expect(social.siteUrl).toBe(SITE);
		expect(social.publisher?.platforms).toEqual(["linkedin"]);
	});

	test("without the encryption secret, no account can be connected", () => {
		const social = socialFromEnv(
			{ PUBLIC_SITE_URL: SITE, LINKEDIN_CLIENT_ID: "client" },
			db,
		);
		expect(social.accounts).toBeUndefined();
		expect(social.publisher).toBeNull();
	});

	test("without a client id, no account can be connected", () => {
		const social = socialFromEnv(
			{ SOCIAL_CREDENTIALS_SECRET: SECRET, PUBLIC_SITE_URL: SITE },
			db,
		);
		expect(social.accounts).toBeUndefined();
	});

	test("Bluesky publishes from its own secrets, with nothing to connect", () => {
		const social = socialFromEnv(
			{
				PUBLIC_SITE_URL: SITE,
				BLUESKY_IDENTIFIER: "codesphere.example",
				BLUESKY_APP_PASSWORD: "app-password",
			},
			db,
		);
		expect(social.accounts).toBeUndefined();
		expect(social.publisher?.platforms).toEqual(["bluesky"]);
	});
});
