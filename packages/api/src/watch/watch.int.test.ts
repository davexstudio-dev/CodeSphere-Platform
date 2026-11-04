/// <reference types="bun" />
// Integration test of the watch feed (#255) against a real Postgres: ingestion, proposals,
// votes, saves, reports and the Admin's moderation.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { user } from "@codesphere/db/schema/auth";
import {
	watchBlockedDomains,
	watchItems,
	watchSources,
} from "@codesphere/db/schema/watch";
import { eq, inArray, like, or } from "drizzle-orm";

import { PrivilegeError } from "../reputation/service";
import { ingestSource, runIngestion } from "./ingest";
import { createWatchService, WatchError } from "./service";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("watch feed on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID().slice(0, 8);
	const host = `it-${run}.example.com`;
	const evil = `evil-${run}.example.org`;
	const admin = `it-watch-admin-${run}`;
	const alice = `it-watch-alice-${run}`;
	const bob = `it-watch-bob-${run}`;
	const bot = `it-watch-bot-${run}`;
	const members = [admin, alice, bob, bot];
	const open = createWatchService(db, {
		flag: 0,
		propose_tag_edit: 0,
		downvote: 0,
		close_vote: 0,
		edit_tags: 0,
		submit_feed_item: 0,
	});
	const strict = createWatchService(db);
	const noQuota = async () => {};
	let sourceId = "";

	const feed = (...links: string[]) =>
		`<rss><channel>${links
			.map(
				(l, i) =>
					`<item><title>Article ${i}</title><link>${l}</link><description>Résumé ${i}</description><pubDate>Mon, 12 Oct 2026 09:0${i}:00 GMT</pubDate></item>`,
			)
			.join("")}</channel></rss>`;

	beforeAll(async () => {
		await db.insert(user).values(
			members.map((id) => ({
				id,
				name: id,
				email: `${id}@example.com`,
				kind: id === bot ? "agent" : "human",
			})),
		);
		const [source] = await db
			.insert(watchSources)
			.values({
				name: `Blog ${run}`,
				feedUrl: `https://${host}/feed.xml`,
				domain: host,
				language: "fr",
				african: true,
				tags: ["web"],
			})
			.returning({ id: watchSources.id });
		sourceId = source?.id ?? "";
	});

	afterAll(async () => {
		await db
			.delete(watchItems)
			.where(
				or(
					like(watchItems.domain, `%${run}%`),
					eq(watchItems.sourceId, sourceId),
				),
			);
		await db.delete(watchSources).where(eq(watchSources.id, sourceId));
		await db
			.delete(watchBlockedDomains)
			.where(inArray(watchBlockedDomains.domain, [evil, host]));
		await db.delete(auditLog).where(eq(auditLog.actorId, admin));
		await db.delete(user).where(inArray(user.id, members));
	});

	test("a Source's items are visible at once, one per normalized URL", async () => {
		const [source] = await db
			.select()
			.from(watchSources)
			.where(eq(watchSources.id, sourceId));
		const added = await ingestSource(db, source as never, async () =>
			feed(
				`https://${host}/a?utm_source=rss`,
				`https://www.${host}/a/`,
				`https://${host}/b`,
			),
		);
		expect(added).toBe(2);
		const again = await ingestSource(db, source as never, async () =>
			feed(`https://${host}/a`, `https://${host}/b`),
		);
		expect(again).toBe(0);
		const page = await strict.list({ limit: 50, tag: "web" }, null);
		const mine = page.items.filter((i) => i.domain === host);
		expect(mine).toHaveLength(2);
		expect(mine[0]).toMatchObject({
			origin: "source",
			sourceName: `Blog ${run}`,
			africanSource: true,
			language: "fr",
			visibility: "visible",
		});
	});

	test("a date in the future is clamped to now", async () => {
		const [source] = await db
			.select()
			.from(watchSources)
			.where(eq(watchSources.id, sourceId));
		const future = `<rss><channel><item><title>Soon</title><link>https://${host}/future</link><pubDate>Fri, 01 Jan 2100 00:00:00 GMT</pubDate></item></channel></rss>`;
		await ingestSource(
			db,
			source as never,
			async () => future,
			() => Date.parse("2026-10-19T10:00:00Z"),
		);
		const [row] = await db
			.select()
			.from(watchItems)
			.where(eq(watchItems.urlKey, `https://${host}/future`));
		expect(row?.publishedAt.toISOString()).toBe("2026-10-19T10:00:00.000Z");
		await db
			.delete(watchItems)
			.where(eq(watchItems.urlKey, `https://${host}/future`));
	});

	test("changing a Source's flag and Tags reaches its existing items", async () => {
		await open.admin.updateSource(admin, {
			id: sourceId,
			african: false,
			tags: ["data"],
		});
		const items = (
			await open.list({ limit: 50, tag: "data" }, null)
		).items.filter((i) => i.domain === host);
		expect(items).toHaveLength(2);
		expect(items.every((i) => !i.africanSource)).toBe(true);
		await open.admin.updateSource(admin, {
			id: sourceId,
			african: true,
			tags: ["web"],
		});
		expect(
			(await open.list({ limit: 50, tag: "web" }, null)).items.filter(
				(i) => i.domain === host && i.africanSource,
			),
		).toHaveLength(2);
	});

	test("a failing feed is recorded on the Source, not thrown", async () => {
		const [source] = await db
			.select()
			.from(watchSources)
			.where(eq(watchSources.id, sourceId));
		await ingestSource(db, source as never, async () => {
			throw new Error("feed answered 503");
		});
		const [after] = await db
			.select()
			.from(watchSources)
			.where(eq(watchSources.id, sourceId));
		expect(after?.lastError).toBe("feed answered 503");
		expect(after?.lastFetchedAt).not.toBeNull();
	});

	test("a Member needs the Reputation to propose; the quota is counted after the checks", async () => {
		let consumed = 0;
		await expect(
			strict.submit(
				{ id: alice, kind: "human" },
				{
					url: `https://x.${host}/p`,
					title: "t",
					summary: "",
					tags: [],
					language: "en",
				},
				async () => {
					consumed++;
				},
			),
		).rejects.toBeInstanceOf(PrivilegeError);
		expect(consumed).toBe(0);
	});

	test("a proposal is pending, deduplicated, refused on a blocked domain", async () => {
		let consumed = 0;
		const consume = async () => {
			consumed++;
		};
		const long = "é".repeat(500);
		const item = await open.submit(
			{ id: alice, kind: "human" },
			{
				url: `https://News.${host}/post?utm_campaign=x#frag`,
				title: "A post",
				summary: long,
				tags: ["sql", "sql"],
				language: "en",
			},
			consume,
		);
		expect(consumed).toBe(1);
		expect(item).toMatchObject({
			origin: "member",
			visibility: "pending",
			tags: ["sql"],
			url: `https://news.${host}/post`,
		});
		expect([...item.summary]).toHaveLength(300);

		await expect(
			open.submit(
				{ id: bob, kind: "human" },
				{
					url: `https://news.${host}/post/`,
					title: "dup",
					summary: "",
					tags: [],
					language: "en",
				},
				consume,
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(consumed).toBe(1);

		await open.admin.blockDomain(admin, evil);
		await expect(
			open.submit(
				{ id: bob, kind: "human" },
				{
					url: `https://sub.${evil}/x`,
					title: "bad",
					summary: "",
					tags: [],
					language: "en",
				},
				consume,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			open.submit(
				{ id: bob, kind: "human" },
				{
					url: "ftp://nope",
					title: "bad",
					summary: "",
					tags: [],
					language: "en",
				},
				consume,
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("a pending proposal becomes visible with a positive human vote, never its author's", async () => {
		const pending = await open.list({ limit: 50, pending: true }, { id: bob });
		const item = pending.items.find((i) => i.domain === `news.${host}`);
		expect(item).toBeDefined();
		const id = item?.id ?? "";
		expect(
			(await open.list({ limit: 50 }, null)).items.some((i) => i.id === id),
		).toBe(false);

		await expect(open.vote(alice, id, 1)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		const downvoted = await open.vote(bob, id, -1);
		expect(downvoted).toMatchObject({
			visibility: "pending",
			score: -1,
			myVote: -1,
		});
		const upvoted = await open.vote(bob, id, 1);
		expect(upvoted).toMatchObject({
			visibility: "visible",
			score: 1,
			myVote: 1,
		});
		expect(
			(await open.list({ limit: 50 }, null)).items.some((i) => i.id === id),
		).toBe(true);

		const retracted = await open.vote(bob, id, 0);
		expect(retracted.myVote).toBeNull();
	});

	test("an Owner cannot vote on what their own Agent proposed", async () => {
		const owner = `it-watch-owner-${run}`;
		const agent = `it-watch-agent-${run}`;
		await db.insert(user).values([
			{ id: owner, name: owner, email: `${owner}@example.com` },
			{
				id: agent,
				name: agent,
				email: `${agent}@example.com`,
				kind: "agent",
				ownerId: owner,
			},
		]);
		try {
			const proposal = await open.submit(
				{ id: agent, kind: "agent" },
				{
					url: `https://owner.${host}/p`,
					title: "Owned",
					summary: "",
					tags: [],
					language: "en",
				},
				noQuota,
			);
			await expect(open.vote(owner, proposal.id, 1)).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
			expect((await open.vote(bob, proposal.id, 1)).visibility).toBe("visible");
		} finally {
			await db.delete(watchItems).where(eq(watchItems.domain, `owner.${host}`));
			await db.delete(user).where(inArray(user.id, [agent, owner]));
		}
	});

	test("anonymous readers cannot ask for pending or saved items", async () => {
		await expect(
			open.list({ limit: 5, pending: true }, null),
		).rejects.toBeInstanceOf(WatchError);
		await expect(
			open.list({ limit: 5, saved: true }, null),
		).rejects.toBeInstanceOf(WatchError);
	});

	test("keeping an item for later is personal and reversible", async () => {
		const [first] = (
			await open.list({ limit: 50, tag: "web" }, null)
		).items.filter((i) => i.domain === host);
		const id = first?.id ?? "";
		expect((await open.save(bob, id, true)).saved).toBe(true);
		const mine = await open.list({ limit: 50, saved: true }, { id: bob });
		expect(mine.items.map((i) => i.id)).toEqual([id]);
		expect(
			(await open.list({ limit: 50, saved: true }, { id: alice })).items,
		).toEqual([]);
		expect((await open.save(bob, id, false)).saved).toBe(false);
	});

	test("reports need the flag privilege and reach the Admin's queue", async () => {
		const [first] = (
			await open.list({ limit: 50, tag: "web" }, null)
		).items.filter((i) => i.domain === host);
		const id = first?.id ?? "";
		await expect(strict.report(bob, id, "spam")).rejects.toBeInstanceOf(
			PrivilegeError,
		);
		await open.report(bob, id, "spam");
		await open.report(alice, id, "off topic");
		const queue = await open.admin.review({ limit: 20 });
		const reported = queue.items.find((i) => i.id === id);
		expect(reported).toMatchObject({ reports: 2 });
		expect(reported?.reasons.sort()).toEqual(["off topic", "spam"]);
		expect(queue.items[0]?.reports).toBeGreaterThanOrEqual(2);
	});

	test("an Admin approves a proposal and removes an item for good", async () => {
		const proposal = await open.submit(
			{ id: bot, kind: "agent" },
			{
				url: `https://agent.${host}/z`,
				title: "From an agent",
				summary: "",
				tags: [],
				language: "en",
			},
			noQuota,
		);
		expect(proposal.origin).toBe("agent");
		await open.admin.approve(admin, proposal.id);
		expect((await open.get(proposal.id, null)).visibility).toBe("visible");
		await expect(open.admin.approve(admin, proposal.id)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});

		await open.admin.removeItem(admin, proposal.id, "off topic");
		expect((await open.get(proposal.id, null)).visibility).toBe("removed");
		await expect(open.vote(bob, proposal.id, 1)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		// The same link cannot be proposed again once removed.
		await expect(
			open.submit(
				{ id: bob, kind: "human" },
				{
					url: `https://agent.${host}/z`,
					title: "again",
					summary: "",
					tags: [],
					language: "en",
				},
				noQuota,
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	test("blocking a domain removes its existing items; the Source's removal blocks it too", async () => {
		const sources = await open.admin.sources();
		expect(sources.find((s) => s.id === sourceId)?.itemCount).toBe(2);
		const { removedItems } = await open.admin.removeSource(admin, sourceId);
		expect(removedItems).toBe(2);
		const listed = await open.list({ limit: 50, tag: "web" }, null);
		expect(listed.items.some((i) => i.domain === host)).toBe(false);
		expect((await open.admin.domains()).some((d) => d.domain === host)).toBe(
			true,
		);
		const [source] = await db
			.select()
			.from(watchSources)
			.where(eq(watchSources.id, sourceId));
		expect(source?.active).toBe(false);

		// Reading it again brings nothing back: the Source is stopped and its domain blocked.
		const result = await runIngestion(db, async () =>
			feed(`https://${host}/c`),
		);
		expect(result.sources).toBeGreaterThanOrEqual(0);
		const back = await db
			.select()
			.from(watchItems)
			.where(eq(watchItems.urlKey, `https://${host}/c`));
		expect(back).toHaveLength(0);

		await open.admin.unblockDomain(admin, host);
		await open.admin.unblockDomain(admin, evil);
		expect((await open.admin.domains()).some((d) => d.domain === host)).toBe(
			false,
		);
	});
});
