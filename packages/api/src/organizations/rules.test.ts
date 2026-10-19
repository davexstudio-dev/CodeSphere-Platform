/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { emailDomain, emailMatchesWebsite } from "./rules";

describe("emailMatchesWebsite", () => {
	test("accepts the website's own domain and its subdomains", () => {
		expect(
			emailMatchesWebsite("rh@systalink.com", "https://www.systalink.com/fr"),
		).toBe(true);
		expect(
			emailMatchesWebsite("rh@mail.systalink.com", "https://systalink.com"),
		).toBe(true);
		expect(
			emailMatchesWebsite("RH@Systalink.COM", "https://systalink.com"),
		).toBe(true);
	});

	test("refuses another domain, a lookalike and a public mailbox", () => {
		expect(emailMatchesWebsite("rh@other.com", "https://systalink.com")).toBe(
			false,
		);
		expect(
			emailMatchesWebsite("rh@notsystalink.com", "https://systalink.com"),
		).toBe(false);
		expect(
			emailMatchesWebsite("rh@systalink.com.evil.io", "https://systalink.com"),
		).toBe(false);
		expect(emailMatchesWebsite("someone@gmail.com", "https://gmail.com")).toBe(
			false,
		);
		expect(emailMatchesWebsite("someone@gmail.com", "https://acme.io")).toBe(
			false,
		);
	});

	test("refuses an unreadable website", () => {
		expect(emailMatchesWebsite("a@b.co", "not a url")).toBe(false);
	});

	test("emailDomain", () => {
		expect(emailDomain("a@WWW.Acme.io")).toBe("acme.io");
	});
});
