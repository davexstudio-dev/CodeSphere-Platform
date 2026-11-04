/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import {
	accountState,
	connectErrorMessage,
	isExpired,
	publicationTone,
	publishablePlatforms,
	publishErrorKey,
	type SocialAccountView,
	shareableQuestions,
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

describe("publishablePlatforms", () => {
	const row = (
		platform: "x" | "linkedin",
		patch: Partial<SocialAccountView> = {},
	) => ({ ...account(patch), platform });

	test("a platform with secrets and no OAuth account can publish", () => {
		expect(publishablePlatforms(["bluesky"], [])).toEqual(["bluesky"]);
	});
	test("a connected account can publish", () => {
		expect(publishablePlatforms(["x"], [row("x")])).toEqual(["x"]);
	});
	test("an account to connect or reconnect cannot", () => {
		expect(
			publishablePlatforms(
				["bluesky", "x", "linkedin"],
				[
					row("x", { status: "reconnect-required" }),
					row("linkedin", { connected: false, status: null }),
				],
			),
		).toEqual(["bluesky"]);
	});
});

describe("publicationTone", () => {
	test("a post published or on its way is fine", () => {
		expect(publicationTone("published")).toBe("default");
		expect(publicationTone("pending")).toBe("default");
	});
	test("every other state is shown as a problem", () => {
		expect(publicationTone("failed")).toBe("destructive");
		expect(publicationTone("unknown")).toBe("destructive");
		expect(publicationTone("processing")).toBe("destructive");
	});
});

describe("publishErrorKey", () => {
	test("each refusal of the server has its message", () => {
		expect(publishErrorKey({ code: "CONFLICT" })).toBe("conflict");
		expect(publishErrorKey({ code: "NOT_FOUND" })).toBe("notFound");
		expect(publishErrorKey({ code: "SERVICE_UNAVAILABLE" })).toBe(
			"unavailable",
		);
		expect(publishErrorKey({ code: "TOO_MANY_REQUESTS" })).toBe("rateLimited");
	});
	test("anything else is a generic failure", () => {
		expect(publishErrorKey(new Error("network"))).toBe("generic");
		expect(publishErrorKey(null)).toBe("generic");
	});
});

describe("shareableQuestions", () => {
	test("a Question written by an Agent is not offered", () => {
		expect(
			shareableQuestions([
				{ id: "1", title: "Humain", authorKind: "human" },
				{ id: "2", title: "Agent", authorKind: "agent" },
			]),
		).toEqual([{ value: "1", label: "Humain" }]);
	});
});
