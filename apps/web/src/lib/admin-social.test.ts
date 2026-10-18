/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import {
	accountState,
	connectErrorMessage,
	isExpired,
	type SocialAccountView,
} from "./admin-social";

const account = (
	patch: Partial<SocialAccountView> = {},
): SocialAccountView => ({
	configured: true,
	connected: true,
	expiresAt: null,
	status: "connected",
	...patch,
});

describe("accountState", () => {
	test("an application that is not set up cannot be connected", () => {
		expect(accountState(account({ configured: false, connected: false }))).toBe(
			"not-configured",
		);
	});
	test("no stored account", () => {
		expect(accountState(account({ connected: false, status: null }))).toBe(
			"not-connected",
		);
	});
	test("a refused grant needs the Admin", () => {
		expect(accountState(account({ status: "reconnect-required" }))).toBe(
			"reconnect-required",
		);
	});
	test("a connected account", () => {
		expect(accountState(account())).toBe("connected");
	});
});

describe("isExpired", () => {
	test("compares the expiry with now", () => {
		const now = Date.parse("2026-10-18T12:00:00Z");
		expect(isExpired("2026-10-18T11:00:00Z", now)).toBe(true);
		expect(isExpired("2026-10-18T13:00:00Z", now)).toBe(false);
		expect(isExpired(null, now)).toBe(false);
	});
});

describe("connectErrorMessage", () => {
	test("shows the server's message on a conflict, a fallback otherwise", () => {
		expect(
			connectErrorMessage({ code: "CONFLICT", message: "Expired." }, "Oops"),
		).toBe("Expired.");
		expect(
			connectErrorMessage({ code: "INTERNAL", message: "boom" }, "Oops"),
		).toBe("Oops");
		expect(connectErrorMessage(null, "Oops")).toBe("Oops");
	});
});
