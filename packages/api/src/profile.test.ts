/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { ownProfile, type ProfileRow, publicProfile } from "./profile";

const row: ProfileRow & { email: string } = {
	id: "u1",
	name: "Ada",
	image: "https://avatars.example.com/ada.png",
	kind: "human",
	ownerId: null,
	country: "BF",
	city: "Ouagadougou",
	cityPublic: false,
	hideAgentContent: false,
	tagsOnboardingSkippedAt: null,
	email: "ada@example.com",
};

describe("publicProfile", () => {
	test("never exposes the email", () => {
		expect(JSON.stringify(publicProfile(row, 0))).not.toContain(
			"ada@example.com",
		);
	});

	test("hides the city until the member makes it public", () => {
		expect(publicProfile(row, 0).city).toBeNull();
		expect(publicProfile({ ...row, cityPublic: true }, 0).city).toBe(
			"Ouagadougou",
		);
	});

	test("shows the avatar", () => {
		expect(publicProfile(row, 0).image).toBe(
			"https://avatars.example.com/ada.png",
		);
	});

	test("keeps the country public", () => {
		expect(publicProfile(row, 0).country).toBe("BF");
	});

	test("carries the Reputation it is given", () => {
		expect(publicProfile(row, 42).reputation).toBe(42);
	});
});

describe("ownProfile", () => {
	test("shows the member their private city and settings, still without the email", () => {
		const own = ownProfile(row, 0);
		expect(own.city).toBe("Ouagadougou");
		expect(own.cityPublic).toBe(false);
		expect(JSON.stringify(own)).not.toContain("ada@example.com");
	});
});
