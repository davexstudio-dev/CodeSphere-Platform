/// <reference types="bun" />
// Rejection, pause, reactivation and creation block of Agents, against Postgres (#245).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { agentPauses, agentRejections } from "@codesphere/db/schema/agents";
import { auditLog } from "@codesphere/db/schema/audit";
import { apikey, user } from "@codesphere/db/schema/auth";
import { answers, questions, votes } from "@codesphere/db/schema/questions";
import { reputationEvents } from "@codesphere/db/schema/reputation";
import { createRouterClient } from "@orpc/server";
import { eq, inArray, or } from "drizzle-orm";

import { NO_FARMING_LIMITS } from "../reputation/farming";
import { appRouter } from "../routers";
import { testContext } from "../test-context";
import { createVoteService } from "../votes/service";
import { type AgentRules, DEFAULT_AGENT_RULES } from "./moderation";
import type { PausedAgent } from "./service";

const url = process.env.TEST_DATABASE_URL;
const NO_PRIVILEGES = {
	flag: 0,
	propose_tag_edit: 0,
	downvote: 0,
	close_vote: 0,
	edit_tags: 0,
};
// Two rejections pause an Agent: enough to exercise the rule with few votes.
const RULES: AgentRules = { ...DEFAULT_AGENT_RULES, pauseAfter: 2 };

describe.skipIf(!url)("Agent moderation on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID();
	const owner = `it-mod-owner-${run}`;
	const asker = `it-mod-asker-${run}`;
	const admin = `it-mod-admin-${run}`;
	const voters = [1, 2, 3].map((n) => `it-mod-voter${n}-${run}`);
	const humans = [owner, asker, admin, ...voters];
	const paused: PausedAgent[] = [];
	let agentA = "";
	let agentB = "";
	const ids: string[] = [...humans];

	const asOwner = () => client(owner, "member");
	const client = (id: string | null, role: string, kind = "human") =>
		createRouterClient(appRouter, {
			context: testContext({
				db,
				agentRules: RULES,
				session: id
					? ({
							user: { id, role, kind },
							session: { id: `s-${id}` },
						} as unknown as Session)
					: null,
			}),
		});
	const votesService = createVoteService(db, NO_PRIVILEGES, NO_FARMING_LIMITS, {
		rules: RULES,
		onPaused: (p) => {
			paused.push(p);
		},
	});

	/** An Agent Answer that three humans down vote: Score -3. */
	async function reject(agentId: string, downvotes = 3) {
		const [q] = await db
			.insert(questions)
			.values({
				authorId: asker,
				idempotencyKey: crypto.randomUUID(),
				title: "Question",
				body: "b",
				bodyHtml: "<p>b</p>",
				language: "en",
				tags: ["sql"],
			})
			.returning();
		const [a] = await db
			.insert(answers)
			.values({
				questionId: q?.id ?? "",
				authorId: agentId,
				idempotencyKey: crypto.randomUUID(),
				body: "bad",
				bodyHtml: "<p>bad</p>",
			})
			.returning();
		for (const voter of voters.slice(0, downvotes)) {
			await votesService.cast(
				voter,
				{ targetType: "answer", targetId: a?.id ?? "" },
				"down",
			);
		}
		return a?.id ?? "";
	}
	const rejections = async (agentId: string) =>
		db
			.select()
			.from(agentRejections)
			.where(eq(agentRejections.agentId, agentId));
	const summary = async (agentId: string) =>
		(await asOwner().agents.list()).items.find((a) => a.id === agentId);

	beforeAll(async () => {
		await db.insert(user).values(
			humans.map((id) => ({
				id,
				name: id,
				email: `${id}@example.com`,
				role: id === admin ? ("admin" as const) : ("member" as const),
			})),
		);
		const create = async (name: string) =>
			(await asOwner().agents.create({ name, preset: "contribute" })).agent.id;
		agentA = await create("a");
		agentB = await create("b");
		ids.push(agentA, agentB);
	});

	afterAll(async () => {
		await db
			.delete(agentRejections)
			.where(inArray(agentRejections.agentId, ids));
		await db.delete(agentPauses).where(inArray(agentPauses.agentId, ids));
		await db
			.delete(reputationEvents)
			.where(
				or(
					inArray(reputationEvents.userId, ids),
					inArray(reputationEvents.actorId, ids),
				),
			);
		await db.delete(votes).where(inArray(votes.userId, ids));
		await db.delete(answers).where(inArray(answers.authorId, ids));
		await db.delete(questions).where(inArray(questions.authorId, ids));
		await db.delete(auditLog).where(inArray(auditLog.actorId, ids));
		await db.delete(auditLog).where(inArray(auditLog.targetId, ids));
		await db.delete(apikey).where(inArray(apikey.referenceId, ids));
		await db.delete(user).where(inArray(user.id, [agentA, agentB]));
		await db.delete(user).where(inArray(user.id, humans));
	});

	test("an Answer at Score -3 is a rejection, and stops being one when the Score recovers", async () => {
		const answerId = await reject(agentA, 2);
		expect(await rejections(agentA)).toHaveLength(0); // Score -2
		await votesService.cast(
			voters[2] ?? "",
			{ targetType: "answer", targetId: answerId },
			"down",
		);
		expect(await rejections(agentA)).toHaveLength(1); // Score -3
		await votesService.retract(voters[2] ?? "", {
			targetType: "answer",
			targetId: answerId,
		});
		expect(await rejections(agentA)).toHaveLength(0);
	});

	test("a human author's Answers are never counted as rejections", async () => {
		const [q] = await db
			.insert(questions)
			.values({
				authorId: asker,
				idempotencyKey: crypto.randomUUID(),
				title: "Q",
				body: "b",
				bodyHtml: "<p>b</p>",
				language: "en",
				tags: ["sql"],
			})
			.returning();
		const [a] = await db
			.insert(answers)
			.values({
				questionId: q?.id ?? "",
				authorId: owner,
				idempotencyKey: crypto.randomUUID(),
				body: "mine",
				bodyHtml: "<p>mine</p>",
			})
			.returning();
		for (const voter of voters) {
			await votesService.cast(
				voter,
				{ targetType: "answer", targetId: a?.id ?? "" },
				"down",
			);
		}
		const all = await db
			.select()
			.from(agentRejections)
			.where(eq(agentRejections.answerId, a?.id ?? ""));
		expect(all).toHaveLength(0);
	});

	test("enough rejections pause the key, tell the Owner and are audited", async () => {
		await reject(agentA);
		expect((await summary(agentA))?.paused).toBe(false); // 1 standing rejection
		await reject(agentA);
		const after = await summary(agentA);
		expect(after).toMatchObject({
			paused: true,
			enabled: false,
			adminOnly: false,
		});
		expect(paused).toMatchObject([{ agentId: agentA, ownerId: owner }]);
		const events = await db
			.select()
			.from(auditLog)
			.where(eq(auditLog.targetId, agentA));
		expect(events.map((e) => e.action)).toContain("agent.pause");
	});

	test("the Owner brings a paused Agent back once", async () => {
		const { agent } = await asOwner().agents.rotateKey({ id: agentA });
		expect(agent).toMatchObject({ paused: false, enabled: true });
	});

	test("after a second pause only an Admin can reactivate it", async () => {
		await reject(agentA);
		await reject(agentA);
		expect(await summary(agentA)).toMatchObject({
			paused: true,
			adminOnly: true,
		});
		await expect(
			asOwner().agents.rotateKey({ id: agentA }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		// A member cannot, a staff member can.
		await expect(
			client(owner, "member").admin.agents.reactivate({ id: agentA }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await client(admin, "admin").admin.agents.reactivate({ id: agentA });
		expect(await summary(agentA)).toMatchObject({
			paused: false,
			enabled: true,
			adminOnly: false,
		});
		const events = await db
			.select()
			.from(auditLog)
			.where(eq(auditLog.targetId, agentA));
		expect(events.map((e) => e.action)).toContain("agent.reactivate");
	});

	test("an Admin cannot reactivate an Agent that is not paused", async () => {
		// Agent A was brought back above; an Owner-disabled key must not be re-enabled by mistake.
		await asOwner().agents.disable({ id: agentA });
		await expect(
			client(admin, "admin").admin.agents.reactivate({ id: agentA }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await summary(agentA)).toMatchObject({ enabled: false });
		await asOwner().agents.rotateKey({ id: agentA });
	});

	test("two paused Agents of one Owner block creating another for 30 days", async () => {
		// Only agent A is paused so far (twice): one Agent, so no block yet.
		await expect(
			asOwner().agents.create({ name: "c", preset: "read" }),
		).resolves.toBeDefined();
		await reject(agentB);
		await reject(agentB);
		const error = await asOwner()
			.agents.create({ name: "d", preset: "read" })
			.catch((caught: unknown) => caught);
		expect(error).toMatchObject({ code: "AGENT_CREATION_BLOCKED" });
		const until = new Date(
			(error as { data: { until: string } }).data.until,
		).getTime();
		const days = (until - Date.now()) / 86_400_000;
		expect(days > 28 && days <= 30).toBe(true);
	});

	test("the public profile shows the Owner, the status and the rates, without Reputation", async () => {
		const profile = await client(null, "member").agents.profile({ id: agentB });
		expect(profile).toMatchObject({
			id: agentB,
			ownerName: owner,
			status: "paused",
			answers: { total: 2, rejected: 2, rejectionRate: 1, validationRate: 0 },
		});
		expect(profile.recent).toHaveLength(2);
		expect(profile.recent[0]).toMatchObject({ outcome: "rejected", score: -3 });
		expect(JSON.stringify(profile)).not.toContain("eputation");
		await expect(
			client(null, "member").agents.profile({ id: owner }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
