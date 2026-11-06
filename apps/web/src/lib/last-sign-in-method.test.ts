/// <reference types="bun" />
import { describe, expect, test as it } from "bun:test";

import { toSignInMethod } from "./last-sign-in-method";

describe("toSignInMethod", () => {
	it("keeps the SSO providers the card shows", () => {
		expect(toSignInMethod("google")).toBe("google");
		expect(toSignInMethod("github")).toBe("github");
		expect(toSignInMethod("gitlab")).toBe("gitlab");
	});

	it("groups the email methods under the email code", () => {
		expect(toSignInMethod("email-otp")).toBe("email");
		expect(toSignInMethod("email")).toBe("email");
	});

	it("ignores no cookie and unknown methods", () => {
		expect(toSignInMethod(null)).toBeNull();
		expect(toSignInMethod("passkey")).toBeNull();
	});
});
