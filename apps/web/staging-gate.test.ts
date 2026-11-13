/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { isOpenPath, stagingGate } from "./staging-gate";

const at = (path: string, authorization?: string) =>
	new Request(`https://staging.example.com${path}`, {
		headers: authorization ? { authorization } : {},
	});
const basic = (user: string, password: string) =>
	`Basic ${btoa(`${user}:${password}`)}`;

describe("stagingGate", () => {
	test("without a password configured, nothing is gated", async () => {
		expect(await stagingGate(at("/"), undefined)).toBeUndefined();
		expect(await stagingGate(at("/"), "")).toBeUndefined();
	});

	test("a request without credentials gets a 401 that asks for them", async () => {
		const res = await stagingGate(at("/"), "s3cret");
		expect(res?.status).toBe(401);
		expect(res?.headers.get("www-authenticate")).toContain("Basic");
		expect(res?.headers.get("cache-control")).toBe("no-store");
		expect(res?.headers.get("x-robots-tag")).toContain("noindex");
	});

	test("a wrong password, a malformed header and another scheme are refused", async () => {
		for (const header of [
			basic("me", "nope"),
			"Basic !!!not-base64!!!",
			`Basic ${btoa("no-colon")}`,
			"Bearer s3cret",
		]) {
			expect((await stagingGate(at("/", header), "s3cret"))?.status).toBe(401);
		}
	});

	test("the right password lets the request through, whatever the user name", async () => {
		expect(
			await stagingGate(at("/", basic("anyone", "s3cret")), "s3cret"),
		).toBeUndefined();
		expect(
			await stagingGate(at("/", basic("", "s3cret")), "s3cret"),
		).toBeUndefined();
	});

	test("a password with a colon in it works", async () => {
		expect(
			await stagingGate(at("/", basic("u", "a:b:c")), "a:b:c"),
		).toBeUndefined();
	});

	test("the machine callers stay open", async () => {
		for (const path of [
			"/api/v1/health",
			"/api/auth/callback/github",
			"/api/auth/oauth-proxy-callback",
			"/webhooks/resend",
		]) {
			expect(await stagingGate(at(path), "s3cret")).toBeUndefined();
		}
	});

	test("everything else is gated, including look-alike paths", () => {
		for (const path of [
			"/",
			"/roadmap",
			"/api/v1/questions",
			"/api/auth/get-session",
			"/api/v1/health/extra",
			"/api/auth/callbackx",
			"/admin/social/callback",
		]) {
			expect(isOpenPath(path)).toBe(false);
		}
	});
});
