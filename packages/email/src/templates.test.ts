/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { render } from "@react-email/render";

import { composeEmail, type EmailMessage } from "./compose";
import { localeFromAcceptLanguage } from "./locale";

const messages = (locale: "fr" | "en"): EmailMessage[] => [
	{ kind: "welcome", props: { name: "Ada", locale } },
	{ kind: "account-deleted", props: { name: "Ada", locale } },
	{ kind: "member-suspended", props: { name: "Ada", reason: "spam", locale } },
	{ kind: "member-reactivated", props: { name: "Ada", locale } },
	{ kind: "api-key-created", props: { name: "Ada", keyName: "ci", locale } },
	{ kind: "agent-paused", props: { name: "Ada", agentName: "helper", locale } },
];

describe("every message renders in French and English", () => {
	for (const locale of ["fr", "en"] as const) {
		for (const message of messages(locale)) {
			test(`${message.kind} (${locale})`, async () => {
				const { subject, template } = composeEmail(message);
				const [html, text] = await Promise.all([
					render(template),
					render(template, { plainText: true }),
				]);
				expect(subject.length).toBeGreaterThan(0);
				expect(html).toContain(`lang="${locale}"`);
				expect(html).toContain("Ada");
				expect(text).not.toContain("<");
				// No remote resource: nothing tracks the reading of an email.
				expect(html.replace(/<!DOCTYPE[^>]*>/, "")).not.toMatch(
					/<img|https?:\/\//,
				);
			});
		}
	}

	test("the French and English subjects differ", () => {
		const fr = messages("fr");
		const en = messages("en");
		fr.forEach((message, index) => {
			const other = en[index] as EmailMessage;
			expect(composeEmail(message).subject).not.toBe(
				composeEmail(other).subject,
			);
		});
	});
});

describe("member-suspended", () => {
	test("shows the reason when there is one and nothing when there is none", async () => {
		const withReason = composeEmail({
			kind: "member-suspended",
			props: { name: "Ada", reason: "Repeated spam" },
		});
		expect(await render(withReason.template)).toContain("Repeated spam");
		const without = composeEmail({
			kind: "member-suspended",
			props: { name: "Ada" },
		});
		expect(await render(without.template)).not.toContain("Reason given");
	});
});

describe("localeFromAcceptLanguage", () => {
	test("picks French from a French browser and English otherwise", () => {
		expect(localeFromAcceptLanguage("fr-FR,fr;q=0.9,en;q=0.8")).toBe("fr");
		expect(localeFromAcceptLanguage("en-US,en;q=0.9")).toBe("en");
		expect(localeFromAcceptLanguage("sw")).toBe("en");
		expect(localeFromAcceptLanguage(null)).toBe("en");
	});
});
