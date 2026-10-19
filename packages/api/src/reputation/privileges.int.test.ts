/// <reference types="bun" />
// Privileges gate the down vote server-side, with a typed error, against Postgres (#240).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import { questions, votes } from "@codesphere/db/schema/questions";
import { reputationEvents } from "@codesphere/db/schema/reputation";
import { createRouterClient } from "@orpc/server";
import { inArray, or } from "drizzle-orm";

import { appRouter } from "../routers";
import { testContext } from "../test-context";
import { parsePrivilegeThresholds } from "./privileges";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("downvote Privilege on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID();
	const author = `it-priv-author-${run}`;
	const rookie = `it-priv-rookie-${run}`;
	const veteran = `it-priv-veteran-${run}`;
	const ids = [author, rookie, veteran];
	let target = { targetType: "question" as const, targetId: "" };

	const clientAs = (id: string, thresholds?: string) =>
		createRouterClient(appRouter, {
			context: testContext({
				db,
				// Explicit: testContext opens every Privilege to keep other suites independent.
				privilegeThresholds: parsePrivilegeThresholds(thresholds),
				session: {
					user: { id, role: "member", kind: "human" },
					session: { id: `s-${id}` },
				} as unknown as Session,
			}),
		});

	beforeAll(async () => {
		await db
			.insert(user)
			.values(ids.map((id) => ({ id, name: id, email: `${id}@example.com` })));
		const [q] = await db
			.insert(questions)
			.values({
				authorId: author,
				idempotencyKey: crypto.randomUUID(),
				title: "Question",
				body: "b",
				bodyHtml: "<p>b</p>",
				language: "en",
				tags: ["sql"],
			})
			.returning();
		target = { targetType: "question", targetId: q?.id ?? "" };
		// The veteran has earned exactly the default threshold.
		await db.insert(reputationEvents).values({
			userId: veteran,
			kind: "upvote_received",
			points: 75,
			cause: "vote",
			actorId: author,
			targetType: "answer",
			targetId: crypto.randomUUID(),
		});
	});

	afterAll(async () => {
		await db
			.delete(reputationEvents)
			.where(
				or(
					inArray(reputationEvents.userId, ids),
					inArray(reputationEvents.actorId, ids),
				),
			);
		await db.delete(votes).where(inArray(votes.userId, ids));
		await db.delete(questions).where(inArray(questions.authorId, ids));
		await db.delete(user).where(inArray(user.id, ids));
	});

	test("a Member below the threshold gets PRIVILEGE_REQUIRED with what is missing", async () => {
		const error = await clientAs(rookie)
			.votes.cast({ ...target, value: "down" })
			.catch((caught: unknown) => caught);
		expect(error).toMatchObject({
			code: "PRIVILEGE_REQUIRED",
			defined: true,
			data: { privilege: "downvote", required: 75, current: 0 },
		});
		// Nothing was recorded.
		const stored = await db
			.select()
			.from(votes)
			.where(inArray(votes.userId, [rookie]));
		expect(stored).toHaveLength(0);
	});

	test("voting up needs no Privilege", async () => {
		expect(
			await clientAs(rookie).votes.cast({ ...target, value: "up" }),
		).toMatchObject({ vote: "up" });
	});

	test("a Member at the threshold can down vote", async () => {
		expect(
			await clientAs(veteran).votes.cast({ ...target, value: "down" }),
		).toMatchObject({ vote: "down" });
	});

	test("repeating a down vote already cast needs no Privilege", async () => {
		// The veteran is now at 74, under the threshold of 75: a retry is still accepted.
		expect(
			await clientAs(veteran).votes.cast({ ...target, value: "down" }),
		).toMatchObject({ vote: "down" });
	});

	test("the threshold is configuration, not code", async () => {
		// A target the veteran has not voted on: a repeat would not be gated.
		const [other] = await db
			.insert(questions)
			.values({
				authorId: author,
				idempotencyKey: crypto.randomUUID(),
				title: "Another question",
				body: "b",
				bodyHtml: "<p>b</p>",
				language: "en",
				tags: ["sql"],
			})
			.returning();
		const fresh = {
			targetType: "question" as const,
			targetId: other?.id ?? "",
		};
		// Raised above the veteran's Reputation: refused.
		await expect(
			clientAs(veteran, '{"downvote": 76}').votes.cast({
				...fresh,
				value: "down",
			}),
		).rejects.toMatchObject({
			code: "PRIVILEGE_REQUIRED",
			// 75 earned, minus the 1 point the veteran paid for the down vote cast just above.
			data: { required: 76, current: 74 },
		});
		// Lowered to 0: even the rookie may.
		expect(
			await clientAs(rookie, '{"downvote": 0}').votes.cast({
				...fresh,
				value: "down",
			}),
		).toMatchObject({ vote: "down" });
	});
});
