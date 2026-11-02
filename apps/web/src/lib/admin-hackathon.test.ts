/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import {
	criteriaTotal,
	draftOf,
	fromLocalInput,
	isDirty,
	prizesComplete,
	toLocalInput,
	updateOf,
} from "./admin-hackathon";

describe("criteriaTotal", () => {
	test("sums the weights", () => {
		expect(criteriaTotal([{ weight: 40 }, { weight: 60 }])).toBe(100);
		expect(criteriaTotal([])).toBe(0);
	});
});

describe("local datetime inputs", () => {
	test("round-trips an ISO instant through the reader's zone", () => {
		const iso = "2026-10-25T17:00:00.000Z";
		expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
	});

	test("gives an empty field for no date and null back", () => {
		expect(toLocalInput(null)).toBe("");
		expect(fromLocalInput("")).toBeNull();
	});
});

describe("isDirty", () => {
	test("compares by value, not by reference", () => {
		expect(isDirty({ a: [1] }, { a: [1] })).toBe(false);
		expect(isDirty({ a: [1] }, { a: [2] })).toBe(true);
		expect(isDirty({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false);
	});
});

describe("the edit form's draft and update call (#338)", () => {
	const hackathon = {
		slug: "demo",
		version: 3,
		name: "Demo",
		organizationSlug: "acme",
		summary: "A demo.",
		teamMin: 1,
		teamMax: 4,
		sourceNote: null,
		teamsEnabled: true,
		milestones: [
			{
				key: "submission",
				label: "Submissions",
				startsAt: "2026-10-25T17:00:00.000Z",
				endsAt: null,
			},
		],
		prizes: [{ label: "First", amount: "1000 EUR", conditions: null }],
		criteria: [{ label: "Impact", weight: 100, scoredBy: "jury" as const }],
	};

	test("an untouched draft is not dirty and keeps the Hackathon's content", () => {
		const draft = draftOf(hackathon);
		expect(isDirty(draftOf(hackathon), draft)).toBe(false);
		expect(draft.prizes).toEqual([
			{ label: "First", amount: "1000 EUR", conditions: "" },
		]);
		expect(draft.sourceNote).toBe("");
	});

	test("the Admin's update carries the organizer, the prizes and the version", () => {
		const call = updateOf(hackathon, draftOf(hackathon), { organizer: true });
		expect(call).toMatchObject({
			slug: "demo",
			expectedVersion: 3,
			organizationSlug: "acme",
			sourceNote: null,
			prizes: [{ label: "First", amount: "1000 EUR", conditions: null }],
		});
		expect(call.milestones).toEqual([
			{
				key: "submission",
				label: "Submissions",
				startsAt: "2026-10-25T17:00:00.000Z",
				endsAt: null,
			},
		]);
	});

	test("an Organization's update leaves the organizer out", () => {
		const call = updateOf(hackathon, draftOf(hackathon), { organizer: false });
		expect(call.organizationSlug).toBeUndefined();
	});

	test("empty prize fields become null and a step with no start is dropped", () => {
		const draft = draftOf(hackathon);
		draft.prizes = [{ label: "Second", amount: " ", conditions: "" }];
		draft.milestones = [
			...draft.milestones,
			{ key: "x", label: "Blank", startsAt: "", endsAt: "" },
		];
		const call = updateOf(hackathon, draft, { organizer: true });
		expect(call.prizes).toEqual([
			{ label: "Second", amount: null, conditions: null },
		]);
		expect(call.milestones).toHaveLength(1);
	});

	test("a prize needs a label", () => {
		expect(prizesComplete([{ label: "First" }])).toBe(true);
		expect(prizesComplete([{ label: "  " }])).toBe(false);
		expect(prizesComplete([])).toBe(true);
	});
});
