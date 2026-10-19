/// <reference types="bun" />
// The demo content follows the platform's rules (spec §2), so the seed never trips on a refused
// write: no vote on one's own content, one Answer per Member and Question, at most one Accepted
// answer, which is never one's own, and 1 to 5 Tags.
import { describe, expect, test } from "bun:test";

import { demoMembers, demoQuestions, type MemberId } from "./content";

const members = new Set<string>(demoMembers.map((m) => m.id));

describe("demo content", () => {
	test("ids and idempotency keys are unique", () => {
		expect(members.size).toBe(demoMembers.length);
		const questionKeys = demoQuestions.map((q) => q.key);
		const answerKeys = demoQuestions.flatMap((q) =>
			q.answers.map((a) => a.key),
		);
		expect(new Set(questionKeys).size).toBe(questionKeys.length);
		expect(new Set(answerKeys).size).toBe(answerKeys.length);
	});

	test("each Question has 1 to 5 Tags and several Answers from other Members", () => {
		for (const q of demoQuestions) {
			expect(q.tags.length).toBeGreaterThanOrEqual(1);
			expect(q.tags.length).toBeLessThanOrEqual(5);
			expect(q.title.length).toBeLessThanOrEqual(200);
			expect(q.answers.length).toBeGreaterThanOrEqual(2);
			const authors = q.answers.map((a) => a.authorId);
			expect(new Set(authors).size).toBe(authors.length);
			expect(authors).not.toContain(q.authorId);
			expect(q.answers.filter((a) => a.accepted).length).toBeLessThanOrEqual(1);
		}
	});

	test("nobody votes on their own content, twice, or from outside the demo Members", () => {
		const check = (authorId: MemberId, voters: MemberId[]) => {
			expect(voters).not.toContain(authorId);
			expect(new Set(voters).size).toBe(voters.length);
			for (const v of voters) expect(members.has(v)).toBe(true);
		};
		for (const q of demoQuestions) {
			check(q.authorId, q.upvotes);
			for (const a of q.answers) check(a.authorId, a.upvotes);
		}
	});

	test("every demo Member receives at least one Vote up, so none shows a Reputation of 0", () => {
		const voted = new Set<string>();
		for (const q of demoQuestions) {
			if (q.upvotes.length > 0) voted.add(q.authorId);
			for (const a of q.answers) {
				if (a.upvotes.length > 0) voted.add(a.authorId);
			}
		}
		expect([...members].filter((id) => !voted.has(id))).toEqual([]);
	});
});
