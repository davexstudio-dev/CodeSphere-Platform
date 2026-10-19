/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { toHackathon } from "./hackathons";

const row = {
	id: "h1",
	slug: "cadev-2026",
	name: "Coupe d'Afrique des Développeurs 2026",
	organizationId: "o1",
	opensAt: null,
	summary: "Concours en ligne.",
	teamMin: 2,
	teamMax: 5,
	sourceUrl: "https://systalink.com/fr/coupe-afrique-des-developpeurs-cadev",
	sourceNote: "Calendrier communiqué par les organisateurs.",
	verifiedAt: new Date("2026-10-11T00:00:00Z"),
	version: 3,
	createdAt: new Date(),
	updatedAt: new Date(),
};

describe("toHackathon", () => {
	test("orders the children by position and serialises dates as ISO", () => {
		const h = toHackathon(row, {
			organization: { name: "Systalink", slug: "systalink" },
			milestones: [
				{
					key: "jury",
					label: "Jury",
					startsAt: new Date("2026-11-01T00:00:00Z"),
					endsAt: null,
					position: 1,
				},
				{
					key: "submission_close",
					label: "Clôture",
					startsAt: new Date("2026-10-25T17:00:00Z"),
					endsAt: null,
					position: 0,
				},
			],
			prizes: [],
			criteria: [
				{ label: "Public", weight: 10, scoredBy: "public", position: 1 },
				{ label: "Pertinence", weight: 90, scoredBy: "jury", position: 0 },
			],
		});
		expect(h.milestones.map((m) => m.key)).toEqual([
			"submission_close",
			"jury",
		]);
		expect(h.milestones[0]?.startsAt).toBe("2026-10-25T17:00:00.000Z");
		expect(h.criteria.map((c) => c.label)).toEqual(["Pertinence", "Public"]);
		expect(h.verifiedAt).toBe("2026-10-11T00:00:00.000Z");
		expect(h.sourceNote).toBe("Calendrier communiqué par les organisateurs.");
		expect(h.version).toBe(3);
	});

	test("refuses a criterion scored by an unknown party instead of guessing", () => {
		expect(() =>
			toHackathon(row, {
				organization: { name: "Systalink", slug: "systalink" },
				milestones: [],
				prizes: [],
				criteria: [
					{ label: "?", weight: 100, scoredBy: "audience", position: 0 },
				],
			}),
		).toThrow();
	});
});
