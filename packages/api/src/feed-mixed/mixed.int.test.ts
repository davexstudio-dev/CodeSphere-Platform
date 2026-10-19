/// <reference types="bun" />
// Integration test of the single « Pour toi » feed (#256) against a real Postgres. Every item of
// the test is created at the same instant with the same Score, so only the ranking factors differ.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import {
	feedAffinity,
	feedMuted,
	feedPreferences,
} from "@codesphere/db/schema/feed";
import { questions } from "@codesphere/db/schema/questions";
import { tagFollows } from "@codesphere/db/schema/tags";
import { watchItems, watchSources } from "@codesphere/db/schema/watch";
import { eq, inArray, like } from "drizzle-orm";

import { deleteMember } from "../members-delete";
import { exportMember } from "../members-export";
import { countWatchClick } from "../watch/clicks";
import { createMixedFeedService } from "./service";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("mixed feed on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID().slice(0, 8);
	const me = `it-mix-me-${run}`;
	const sn = `it-mix-sn-${run}`;
	const us = `it-mix-us-${run}`;
	const users = [me, sn, us];
	const followed = `fol-${run}`;
	const other = `oth-${run}`;
	const learned = `lrn-${run}`;
	const feed = createMixedFeedService(db);
	const at = new Date(Date.now() - 60_000);
	const ids: Record<string, string> = {};
	let sourceId = "";

	const ask = async (
		key: string,
		authorId: string,
		tags: string[],
		language: "fr" | "en" = "fr",
	) => {
		const [row] = await db
			.insert(questions)
			.values({
				authorId,
				idempotencyKey: crypto.randomUUID(),
				title: `Mix ${key} ${run}`,
				body: "b",
				bodyHtml: "<p>b</p>",
				language,
				tags,
				createdAt: at,
			})
			.returning({ id: questions.id });
		ids[key] = row?.id ?? "";
	};
	const link = async (
		key: string,
		tags: string[],
		extra: Partial<typeof watchItems.$inferInsert> = {},
	) => {
		const [row] = await db
			.insert(watchItems)
			.values({
				url: `https://${key}.${run}.example.com/x`,
				urlKey: `https://${key}.${run}.example.com/x`,
				domain: `${key}.${run}.example.com`,
				title: `Link ${key} ${run}`,
				summary: "s",
				tags,
				language: "fr",
				visibility: "visible",
				publishedAt: at,
				...extra,
			})
			.returning({ id: watchItems.id });
		ids[key] = row?.id ?? "";
	};
	const mine = async (
		input: { language?: "fr" | "en"; limit?: number } = {},
		who = me,
	) => {
		const page = await feed.mixed(who, { limit: 50, ...input });
		const all = new Set(Object.values(ids));
		return {
			...page,
			ranked: page.items
				.map((i) => (i.kind === "question" ? i.question.id : i.item.id))
				.filter((id) => all.has(id)),
		};
	};
	const pos = (ranked: string[], key: string) => ranked.indexOf(ids[key] ?? "");

	beforeAll(async () => {
		await db.insert(user).values([
			{ id: me, name: me, email: `${me}@example.com` },
			{ id: sn, name: sn, email: `${sn}@example.com`, country: "SN" },
			{ id: us, name: us, email: `${us}@example.com`, country: "US" },
		]);
		await db.insert(tagFollows).values({ userId: me, tag: followed });
		const [source] = await db
			.insert(watchSources)
			.values({
				name: `Src ${run}`,
				feedUrl: `https://src.${run}.example.com/feed`,
				domain: `src.${run}.example.com`,
				language: "fr",
				african: false,
			})
			.returning({ id: watchSources.id });
		sourceId = source?.id ?? "";
		await ask("qFollowed", us, [followed, "zz-a"]);
		await ask("qPlain", us, [other, "zz-b"]);
		await ask("qAfrican", sn, [other, "zz-c"]);
		await ask("qEnglish", us, [other, "zz-d"], "en");
		await link("wFollowed", [followed, "zz-e"]);
		await link("wAfrican", [other, "zz-f"], { africanSource: true });
	});

	afterAll(async () => {
		await db.delete(questions).where(like(questions.title, `Mix % ${run}`));
		await db
			.delete(watchItems)
			.where(like(watchItems.domain, `%.${run}.example.com`));
		await db.delete(watchSources).where(eq(watchSources.id, sourceId));
		await db.delete(feedMuted).where(inArray(feedMuted.userId, users));
		await db.delete(feedAffinity).where(inArray(feedAffinity.userId, users));
		await db
			.delete(feedPreferences)
			.where(inArray(feedPreferences.userId, users));
		await db.delete(tagFollows).where(inArray(tagFollows.userId, users));
		await db.delete(user).where(inArray(user.id, users));
	});

	test("Questions and watch items are ranked together, followed Tags first, with their reason", async () => {
		const page = await mine();
		expect(page).toMatchObject({ personalized: true, fallback: false });
		expect(pos(page.ranked, "qFollowed")).toBeLessThan(
			pos(page.ranked, "qPlain"),
		);
		expect(pos(page.ranked, "wFollowed")).toBeLessThan(
			pos(page.ranked, "wAfrican"),
		);
		const reason = (key: string) =>
			page.items.find(
				(i) => (i.kind === "question" ? i.question.id : i.item.id) === ids[key],
			)?.reasons;
		expect(reason("qFollowed")?.[0]).toEqual({
			code: "followed_tag",
			value: followed,
		});
		expect(reason("qPlain")).toEqual([{ code: "trending" }]);
		expect(reason("wAfrican")).toEqual([{ code: "african" }]);
	});

	test("the African bonus lifts an African author or source, the language bonus the reader's language", async () => {
		const page = await mine({ language: "fr" });
		// qAfrican (SN author) beats qPlain (US author) at equal hot score and affinity.
		expect(pos(page.ranked, "qAfrican")).toBeLessThan(
			pos(page.ranked, "qPlain"),
		);
		// In French, the French Question beats the equal English one.
		expect(pos(page.ranked, "qPlain")).toBeLessThan(
			pos(page.ranked, "qEnglish"),
		);
		const english = await mine({ language: "en" });
		expect(pos(english.ranked, "qEnglish")).toBeLessThan(
			pos(english.ranked, "qPlain"),
		);
		const reasons = page.items.find(
			(i) => i.kind === "question" && i.question.id === ids.qAfrican,
		)?.reasons;
		expect(reasons?.map((r) => r.code)).toEqual(["language", "african"]);
	});

	test("« Moins comme ça » hides a Tag or a Source, and can be undone", async () => {
		await feed.mute(me, { kind: "tag", key: "zz-b" });
		await feed.mute(me, {
			kind: "source",
			key: `domain:wAfrican.${run}.example.com`,
		});
		const hidden = await mine();
		expect(hidden.ranked).not.toContain(ids.qPlain ?? "");
		expect(hidden.ranked).not.toContain(ids.wAfrican ?? "");
		expect(hidden.ranked).toContain(ids.qAfrican ?? "");
		const view = await feed.view(me);
		expect(view.muted.map((m) => m.key)).toContain("zz-b");
		await feed.unmute(me, { kind: "tag", key: "zz-b" });
		await feed.unmute(me, {
			kind: "source",
			key: `domain:wAfrican.${run}.example.com`,
		});
		expect((await mine()).ranked).toContain(ids.qPlain ?? "");
	});

	test("« Moins comme ça » holds even with personalisation off", async () => {
		await feed.mute(me, { kind: "tag", key: "zz-a" });
		await feed.update(me, { personalization: false });
		const page = await mine();
		expect(page.ranked).not.toContain(ids.qFollowed ?? "");
		expect(page.ranked).toContain(ids.wFollowed ?? "");
		await feed.update(me, { personalization: true });
		await feed.unmute(me, { kind: "tag", key: "zz-a" });
	});

	test("two partial updates keep each other's field; re-sent upvotes are known", async () => {
		await Promise.all([
			feed.update(me, { personalization: false }),
			feed.update(me, { language: "en" }),
		]);
		expect(await feed.view(me)).toMatchObject({
			personalization: false,
			language: "en",
		});
		await feed.update(me, { personalization: true, language: null });
		expect(await feed.hasUpvoted(me, ids.qPlain ?? "")).toBe(false);
	});

	test("what an upvote teaches lifts the Tag, capped", async () => {
		const before = await mine();
		await feed.learn(me, ["zz-d"], 100);
		const after = await mine({ language: "fr" });
		expect(pos(after.ranked, "qEnglish")).toBeLessThan(
			pos(before.ranked, "qEnglish"),
		);
		const [weight] = await db
			.select({ weight: feedAffinity.weight })
			.from(feedAffinity)
			.where(eq(feedAffinity.userId, me));
		expect(weight?.weight).toBe(10);
		const reasons = after.items.find(
			(i) => i.kind === "question" && i.question.id === ids.qEnglish,
		)?.reasons;
		expect(reasons?.[0]).toEqual({ code: "learned_tag", value: "zz-d" });
	});

	test("without personalisation: hot score on the followed Tags only, no bonus, no learning", async () => {
		await feed.update(me, { personalization: false });
		await feed.learn(me, [learned], 5);
		const [row] = await db
			.select()
			.from(feedAffinity)
			.where(eq(feedAffinity.tag, learned));
		expect(row).toBeUndefined();
		const page = await mine({ language: "fr" });
		expect(page).toMatchObject({ personalized: false, fallback: false });
		expect(page.ranked.sort()).toEqual(
			[ids.qFollowed ?? "", ids.wFollowed ?? ""].sort(),
		);
		expect(page.items.every((i) => i.reasons[0]?.code === "followed_tag")).toBe(
			true,
		);
		await feed.update(me, { personalization: true });
	});

	test("a Member who follows nothing and turns personalisation off gets the hottest overall", async () => {
		await feed.update(us, { personalization: false });
		const page = await feed.mixed(us, { limit: 5 });
		expect(page).toMatchObject({ personalized: false, fallback: true });
		expect(page.items.length).toBeGreaterThan(0);
	});

	test("never more than two in a row from the same Source", async () => {
		for (const k of ["s1", "s2", "s3", "s4"]) {
			await link(k, [`zz-${k}`], { sourceId });
		}
		const page = await mine();
		const keys = page.items
			.filter((i) => i.kind === "watch" && i.sourceKey === sourceId)
			.map((i) => (i.kind === "watch" ? i.item.id : ""));
		expect(keys).toHaveLength(4);
		let run3 = 0;
		let streak = 0;
		for (const item of page.items) {
			streak = item.sourceKey === sourceId ? streak + 1 : 0;
			run3 = Math.max(run3, streak);
		}
		expect(run3).toBeLessThanOrEqual(2);
	});

	test("pages follow each other without repeat", async () => {
		const seen = new Set<string>();
		let cursor: string | undefined;
		for (let i = 0; i < 4; i++) {
			const page = await feed.mixed(me, { limit: 5, cursor });
			for (const item of page.items) {
				const id = item.kind === "question" ? item.question.id : item.item.id;
				expect(seen.has(id)).toBe(false);
				seen.add(id);
			}
			if (!page.nextCursor) break;
			cursor = page.nextCursor;
		}
		expect(seen.size).toBeGreaterThan(5);
	});

	test("the profile is exported and deleted with the account", async () => {
		await feed.mute(me, { kind: "tag", key: "zz-x" });
		await feed.learn(me, [learned], 2);
		const exported = await exportMember(db, me);
		expect(exported?.feedProfile.muted).toContainEqual({
			kind: "tag",
			key: "zz-x",
		});
		expect(exported?.feedProfile.affinity.map((a) => a.tag)).toContain(learned);
		await deleteMember(db, me, false);
		for (const table of [feedPreferences, feedMuted, feedAffinity]) {
			const rows = await db.select().from(table).where(eq(table.userId, me));
			expect(rows).toEqual([]);
		}
	});

	test("an outbound click is counted per item, with no record of who", async () => {
		expect(await countWatchClick(db, ids.wFollowed ?? "")).toBe(
			`https://wFollowed.${run}.example.com/x`,
		);
		expect(await countWatchClick(db, ids.wFollowed ?? "")).not.toBeNull();
		const [row] = await db
			.select({ n: watchItems.clickCount })
			.from(watchItems)
			.where(eq(watchItems.id, ids.wFollowed ?? ""));
		expect(row?.n).toBe(2);
		await db
			.update(watchItems)
			.set({ visibility: "removed" })
			.where(eq(watchItems.id, ids.wFollowed ?? ""));
		expect(await countWatchClick(db, ids.wFollowed ?? "")).toBeNull();
		expect(await countWatchClick(db, "not-a-uuid")).toBeNull();
	});
});
