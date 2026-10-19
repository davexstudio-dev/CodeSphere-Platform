/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { applyChannel, asksCandidateForMoney, expiryOf } from "./rules";

describe("asksCandidateForMoney", () => {
	test("catches the usual scam wordings, in French and English", () => {
		for (const text of [
			"Des frais de dossier de 15 000 FCFA sont à régler.",
			"Frais d'inscription obligatoires avant l'entretien",
			"A small registration fee is required.",
			"You must pay a fee to apply.",
			"Veuillez payer 10 000 FCFA pour postuler.",
			"Envoyez 20 000 via mobile money avant l'embauche.",
			"Send the money by Western Union.",
			"Dépôt de garantie remboursable à verser",
			"Training fees apply",
		]) {
			expect(asksCandidateForMoney(text)).toBe(true);
		}
	});

	test("lets an honest posting through", () => {
		for (const text of [
			"We pay a competitive salary by mobile money, every month.",
			"Nous offrons une prise en charge des frais de transport.",
			"Develop payment APIs for mobile money operators.",
			"Salaire versé le 5 de chaque mois, avec une prime de formation.",
			"Apply with your CV and a link to your code.",
			"Send your CV and a code sample to apply.",
			"Use version control to apply best practices.",
			"We give you a stipend to purchase your laptop.",
		]) {
			expect(asksCandidateForMoney(text)).toBe(false);
		}
	});
});

describe("applyChannel", () => {
	test("exactly one of a link and an email", () => {
		expect(applyChannel({ applyUrl: "https://a.io/jobs" })).toBe("url");
		expect(applyChannel({ applyEmail: "jobs@a.io" })).toBe("email");
		expect(applyChannel({})).toBeNull();
		expect(
			applyChannel({ applyUrl: "https://a.io", applyEmail: "a@a.io" }),
		).toBeNull();
	});
});

describe("expiryOf", () => {
	test("is 30 days after publication", () => {
		expect(expiryOf(new Date("2026-10-19T10:00:00Z")).toISOString()).toBe(
			"2026-11-18T10:00:00.000Z",
		);
	});
});
