import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import {
	watchBlockedDomains,
	watchItemReports,
	watchItemSaves,
	watchItems,
	watchItemVotes,
	watchSources,
} from "@codesphere/db/schema/watch";
import { and, desc, eq, exists, lt, or, type SQL, sql } from "drizzle-orm";

import { withAudit } from "../audit";
import {
	DEFAULT_PRIVILEGE_THRESHOLDS,
	type PrivilegeThresholds,
	requirePrivilege,
} from "../reputation/privileges";
import { SUMMARY_MAX, truncate } from "./feed-parser";
import { domainOf, InvalidUrlError, isBlocked, normalizeUrl } from "./url";

export class WatchError extends Error {
	constructor(
		readonly code: "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "BAD_REQUEST",
	) {
		super(code);
	}
}

export class InvalidWatchCursorError extends Error {}

type Language = "fr" | "en";
type Viewer = { id: string } | null;

type ItemFilter = {
	tag?: string;
	language?: Language;
	african?: boolean;
	pending?: boolean;
	saved?: boolean;
	cursor?: string;
	limit: number;
};

const encodeCursor = (publishedAt: Date, id: string) =>
	`${publishedAt.getTime()}_${id}`;

function decodeCursor(cursor: string) {
	const match = /^(\d{1,15})_([0-9a-f-]{36})$/.exec(cursor);
	if (!match) {
		throw new InvalidWatchCursorError();
	}
	return { at: new Date(Number(match[1])), id: match[2] as string };
}

const hostOf = (url: string) => {
	try {
		return domainOf(url);
	} catch {
		throw new WatchError("BAD_REQUEST");
	}
};

export function createWatchService(
	db: Database,
	thresholds: PrivilegeThresholds = DEFAULT_PRIVILEGE_THRESHOLDS,
) {
	const score = sql<number>`COALESCE((SELECT SUM(v.value) FROM watch_item_votes v WHERE v.item_id = ${watchItems.id}), 0)::int`;

	const itemColumns = (viewer: Viewer) => ({
		id: watchItems.id,
		url: watchItems.url,
		domain: watchItems.domain,
		title: watchItems.title,
		summary: watchItems.summary,
		tags: watchItems.tags,
		language: watchItems.language,
		africanSource: watchItems.africanSource,
		sourceName: watchSources.name,
		submitterKind: user.kind,
		visibility: watchItems.visibility,
		publishedAt: watchItems.publishedAt,
		score,
		myVote: viewer
			? sql<
					number | null
				>`(SELECT v.value FROM watch_item_votes v WHERE v.item_id = ${watchItems.id} AND v.user_id = ${viewer.id})`
			: sql<number | null>`NULL`,
		saved: viewer
			? sql<boolean>`EXISTS (SELECT 1 FROM watch_item_saves s WHERE s.item_id = ${watchItems.id} AND s.user_id = ${viewer.id})`
			: sql<boolean>`false`,
	});

	type Row = Awaited<ReturnType<typeof selectItems>>[number];

	const selectItems = (viewer: Viewer, where?: SQL) =>
		db
			.select(itemColumns(viewer))
			.from(watchItems)
			.leftJoin(watchSources, eq(watchSources.id, watchItems.sourceId))
			.leftJoin(user, eq(user.id, watchItems.submitterId))
			.where(where);

	const toItem = (row: Row) => ({
		id: row.id,
		url: row.url,
		domain: row.domain,
		title: row.title,
		summary: row.summary,
		tags: row.tags,
		language: row.language,
		africanSource: row.africanSource,
		sourceName: row.sourceName,
		origin: row.sourceName
			? ("source" as const)
			: row.submitterKind === "agent"
				? ("agent" as const)
				: ("member" as const),
		visibility: row.visibility,
		publishedAt: row.publishedAt,
		score: Number(row.score),
		myVote:
			row.myVote === 1
				? (1 as const)
				: row.myVote === -1
					? (-1 as const)
					: null,
		saved: Boolean(row.saved),
	});

	async function get(id: string, viewer: Viewer) {
		const [row] = await selectItems(viewer, eq(watchItems.id, id)).limit(1);
		if (!row) {
			throw new WatchError("NOT_FOUND");
		}
		return toItem(row);
	}

	// A live item: one that exists and was not removed.
	async function live(id: string) {
		const [row] = await db
			.select({
				id: watchItems.id,
				submitterId: watchItems.submitterId,
				visibility: watchItems.visibility,
			})
			.from(watchItems)
			.where(
				and(eq(watchItems.id, id), sql`${watchItems.visibility} <> 'removed'`),
			)
			.limit(1);
		if (!row) {
			throw new WatchError("NOT_FOUND");
		}
		return row;
	}

	async function blockedDomains() {
		const rows = await db
			.select({ domain: watchBlockedDomains.domain })
			.from(watchBlockedDomains);
		return rows.map((row) => row.domain);
	}

	return {
		get,

		async list(filter: ItemFilter, viewer: Viewer) {
			if ((filter.pending || filter.saved) && !viewer) {
				throw new WatchError("FORBIDDEN");
			}
			const conditions: (SQL | undefined)[] = [
				eq(watchItems.visibility, filter.pending ? "pending" : "visible"),
				filter.tag ? sql`${filter.tag} = ANY (${watchItems.tags})` : undefined,
				filter.language ? eq(watchItems.language, filter.language) : undefined,
				filter.african === undefined
					? undefined
					: eq(watchItems.africanSource, filter.african),
				filter.saved && viewer
					? exists(
							db
								.select({ one: sql`1` })
								.from(watchItemSaves)
								.where(
									and(
										eq(watchItemSaves.itemId, watchItems.id),
										eq(watchItemSaves.userId, viewer.id),
									),
								),
						)
					: undefined,
			];
			if (filter.cursor) {
				const { at, id } = decodeCursor(filter.cursor);
				conditions.push(
					or(
						lt(watchItems.publishedAt, at),
						and(eq(watchItems.publishedAt, at), lt(watchItems.id, id)),
					),
				);
			}
			const rows = await selectItems(viewer, and(...conditions))
				.orderBy(desc(watchItems.publishedAt), desc(watchItems.id))
				.limit(filter.limit + 1);
			const page = rows.slice(0, filter.limit);
			const last = page[page.length - 1];
			return {
				items: page.map(toItem),
				nextCursor:
					rows.length > filter.limit && last
						? encodeCursor(last.publishedAt, last.id)
						: null,
			};
		},

		/**
		 * A proposal. The privilege is checked first, then `consume` counts the daily quota, so a
		 * refused proposal costs nothing; the item waits for a positive human vote or an Admin.
		 */
		async submit(
			actor: { id: string; kind: "human" | "agent" },
			input: {
				url: string;
				title: string;
				summary: string;
				tags: string[];
				language: Language;
			},
			consume: () => Promise<void>,
		) {
			if (actor.kind === "human") {
				await requirePrivilege(db, actor, "submit_feed_item", thresholds);
			}
			let urlKey: string;
			try {
				urlKey = normalizeUrl(input.url);
			} catch (error) {
				if (error instanceof InvalidUrlError) {
					throw new WatchError("BAD_REQUEST");
				}
				throw error;
			}
			const domain = hostOf(urlKey);
			if (isBlocked(domain, await blockedDomains())) {
				throw new WatchError("FORBIDDEN");
			}
			const [existing] = await db
				.select({ id: watchItems.id })
				.from(watchItems)
				.where(eq(watchItems.urlKey, urlKey))
				.limit(1);
			if (existing) {
				throw new WatchError("CONFLICT");
			}
			await consume();
			const [created] = await db
				.insert(watchItems)
				.values({
					url: urlKey,
					urlKey,
					domain,
					title: input.title,
					summary: truncate(input.summary, SUMMARY_MAX),
					tags: [...new Set(input.tags)],
					language: input.language,
					submitterId: actor.id,
					visibility: "pending",
					publishedAt: new Date(),
				})
				.onConflictDoNothing({ target: watchItems.urlKey })
				.returning({ id: watchItems.id });
			if (!created) {
				throw new WatchError("CONFLICT");
			}
			return get(created.id, actor);
		},

		/** A human's vote (0 retracts). The first positive balance makes a proposal visible. */
		async vote(userId: string, itemId: string, value: 1 | -1 | 0) {
			const item = await live(itemId);
			if (item.submitterId === userId) {
				throw new WatchError("FORBIDDEN");
			}
			if (value === 0) {
				await db
					.delete(watchItemVotes)
					.where(
						and(
							eq(watchItemVotes.userId, userId),
							eq(watchItemVotes.itemId, itemId),
						),
					);
			} else {
				await db
					.insert(watchItemVotes)
					.values({ userId, itemId, value })
					.onConflictDoUpdate({
						target: [watchItemVotes.userId, watchItemVotes.itemId],
						set: { value },
					});
			}
			await db
				.update(watchItems)
				.set({ visibility: "visible" })
				.where(
					and(
						eq(watchItems.id, itemId),
						eq(watchItems.visibility, "pending"),
						sql`(SELECT COALESCE(SUM(v.value), 0) FROM watch_item_votes v WHERE v.item_id = ${watchItems.id}) > 0`,
					),
				);
			return get(itemId, { id: userId });
		},

		async save(userId: string, itemId: string, saved: boolean) {
			await live(itemId);
			if (saved) {
				await db
					.insert(watchItemSaves)
					.values({ userId, itemId })
					.onConflictDoNothing();
			} else {
				await db
					.delete(watchItemSaves)
					.where(
						and(
							eq(watchItemSaves.userId, userId),
							eq(watchItemSaves.itemId, itemId),
						),
					);
			}
			return get(itemId, { id: userId });
		},

		async report(userId: string, itemId: string, reason: string) {
			await requirePrivilege(db, { id: userId }, "flag", thresholds);
			await live(itemId);
			await db
				.insert(watchItemReports)
				.values({ userId, itemId, reason })
				.onConflictDoUpdate({
					target: [watchItemReports.userId, watchItemReports.itemId],
					set: { reason },
				});
		},

		admin: {
			async sources() {
				const rows = await db
					.select({
						id: watchSources.id,
						name: watchSources.name,
						feedUrl: watchSources.feedUrl,
						domain: watchSources.domain,
						language: watchSources.language,
						african: watchSources.african,
						tags: watchSources.tags,
						active: watchSources.active,
						lastFetchedAt: watchSources.lastFetchedAt,
						lastError: watchSources.lastError,
						itemCount: sql<number>`(SELECT count(*)::int FROM watch_items i WHERE i.source_id = "watch_sources"."id" AND i.visibility <> 'removed')`,
					})
					.from(watchSources)
					.orderBy(watchSources.name);
				return rows;
			},

			async createSource(
				actorId: string,
				input: {
					name: string;
					feedUrl: string;
					language: Language;
					african: boolean;
					tags: string[];
				},
			) {
				if (!input.feedUrl.startsWith("https://")) {
					throw new WatchError("BAD_REQUEST");
				}
				const domain = hostOf(input.feedUrl);
				const rows = await withAudit(
					db,
					{
						actorId,
						action: "watch_source.create",
						targetType: "watch_source",
						targetIdColumn: "id",
					},
					db
						.insert(watchSources)
						.values({
							name: input.name,
							feedUrl: input.feedUrl,
							domain,
							language: input.language,
							african: input.african,
							tags: [...new Set(input.tags)],
						})
						.onConflictDoNothing({ target: watchSources.feedUrl })
						.returning({ id: watchSources.id }),
				);
				const id = rows[0]?.id as string | undefined;
				if (!id) {
					throw new WatchError("CONFLICT");
				}
				return this.source(id);
			},

			async source(id: string) {
				const found = (await this.sources()).find((s) => s.id === id);
				if (!found) {
					throw new WatchError("NOT_FOUND");
				}
				return found;
			},

			async updateSource(
				actorId: string,
				input: {
					id: string;
					active?: boolean;
					african?: boolean;
					tags?: string[];
				},
			) {
				const set = {
					...(input.active === undefined ? {} : { active: input.active }),
					...(input.african === undefined ? {} : { african: input.african }),
					...(input.tags === undefined
						? {}
						: { tags: [...new Set(input.tags)] }),
					version: sql`${watchSources.version} + 1`,
				};
				const rows = await withAudit(
					db,
					{
						actorId,
						action: "watch_source.update",
						targetType: "watch_source",
						targetIdColumn: "id",
						details: {
							fields: Object.keys(set).filter((k) => k !== "version"),
						},
					},
					db
						.update(watchSources)
						.set(set)
						.where(eq(watchSources.id, input.id))
						.returning({ id: watchSources.id }),
					// A flag or Tags change reaches the Source's existing items.
					[
						sql`UPDATE watch_items SET african_source = s.african
							FROM watch_sources s WHERE s.id = ${input.id} AND watch_items.source_id = s.id
							AND EXISTS (SELECT 1 FROM m)`,
					],
				);
				if (rows.length === 0) {
					throw new WatchError("NOT_FOUND");
				}
				return this.source(input.id);
			},

			/** Removal on a Source's request: items removed, Source stopped, domain blocked. */
			async removeSource(actorId: string, id: string) {
				const [source] = await db
					.select()
					.from(watchSources)
					.where(eq(watchSources.id, id))
					.limit(1);
				if (!source) {
					throw new WatchError("NOT_FOUND");
				}
				const [{ n } = { n: 0 }] = await db
					.select({ n: sql<number>`count(*)::int` })
					.from(watchItems)
					.where(
						and(
							eq(watchItems.sourceId, id),
							sql`${watchItems.visibility} <> 'removed'`,
						),
					);
				await withAudit(
					db,
					{
						actorId,
						action: "watch_source.remove",
						targetType: "watch_source",
						targetIdColumn: "id",
						details: { reason: "source_request" },
					},
					db
						.update(watchSources)
						.set({ active: false })
						.where(eq(watchSources.id, id))
						.returning({ id: watchSources.id }),
					[
						sql`UPDATE watch_items SET visibility = 'removed', removed_reason = 'source_request'
							WHERE source_id = ${id} AND visibility <> 'removed' AND EXISTS (SELECT 1 FROM m)`,
						sql`INSERT INTO watch_blocked_domains (domain, reason)
							SELECT ${source.domain}, 'source_request' FROM m
							ON CONFLICT (domain) DO NOTHING`,
					],
				);
				return { removedItems: Number(n) };
			},

			/** Reported items first (most reports first), then proposals waiting for a vote. */
			async review(page: { cursor?: string; limit: number }) {
				const offset = decodeOffset(page.cursor);
				const reports = sql<number>`(SELECT count(*)::int FROM watch_item_reports r WHERE r.item_id = ${watchItems.id})`;
				const rows = await db
					.select({
						...itemColumns(null),
						reports,
						reasons: sql<
							string[]
						>`COALESCE((SELECT array_agg(r.reason) FROM watch_item_reports r WHERE r.item_id = ${watchItems.id}), '{}')`,
					})
					.from(watchItems)
					.leftJoin(watchSources, eq(watchSources.id, watchItems.sourceId))
					.leftJoin(user, eq(user.id, watchItems.submitterId))
					.where(
						and(
							sql`${watchItems.visibility} <> 'removed'`,
							or(eq(watchItems.visibility, "pending"), sql`${reports} > 0`),
						),
					)
					.orderBy(
						desc(reports),
						desc(watchItems.createdAt),
						desc(watchItems.id),
					)
					.limit(page.limit + 1)
					.offset(offset);
				return {
					items: rows.slice(0, page.limit).map((row) => ({
						...toItem(row),
						reports: Number(row.reports),
						reasons: row.reasons,
					})),
					nextCursor:
						rows.length > page.limit ? `o${offset + page.limit}` : null,
				};
			},

			async approve(actorId: string, itemId: string) {
				const rows = await withAudit(
					db,
					{
						actorId,
						action: "watch_item.approve",
						targetType: "watch_item",
						targetIdColumn: "id",
					},
					db
						.update(watchItems)
						.set({ visibility: "visible" })
						.where(
							and(
								eq(watchItems.id, itemId),
								eq(watchItems.visibility, "pending"),
							),
						)
						.returning({ id: watchItems.id }),
					// Reports on an approved item are answered.
					[
						sql`DELETE FROM watch_item_reports WHERE item_id IN (SELECT id FROM m)`,
					],
				);
				if (rows.length === 0) {
					throw new WatchError("NOT_FOUND");
				}
			},

			async removeItem(actorId: string, itemId: string, reason: string) {
				const rows = await withAudit(
					db,
					{
						actorId,
						action: "watch_item.remove",
						targetType: "watch_item",
						targetIdColumn: "id",
						details: { reason: "admin" },
					},
					db
						.update(watchItems)
						.set({ visibility: "removed", removedReason: reason })
						.where(
							and(
								eq(watchItems.id, itemId),
								sql`${watchItems.visibility} <> 'removed'`,
							),
						)
						.returning({ id: watchItems.id }),
				);
				if (rows.length === 0) {
					throw new WatchError("NOT_FOUND");
				}
			},

			domains() {
				return db
					.select({
						domain: watchBlockedDomains.domain,
						reason: watchBlockedDomains.reason,
					})
					.from(watchBlockedDomains)
					.orderBy(watchBlockedDomains.domain);
			},

			async blockDomain(actorId: string, rawDomain: string, reason?: string) {
				const domain = rawDomain.replace(/^www\./, "");
				if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
					throw new WatchError("BAD_REQUEST");
				}
				const [{ n } = { n: 0 }] = await db
					.select({ n: sql<number>`count(*)::int` })
					.from(watchItems)
					.where(
						and(
							sql`(${watchItems.domain} = ${domain} OR ${watchItems.domain} LIKE ${`%.${domain}`})`,
							sql`${watchItems.visibility} <> 'removed'`,
						),
					);
				await withAudit(
					db,
					{
						actorId,
						action: "watch_domain.block",
						targetType: "watch_domain",
						targetIdColumn: "domain",
					},
					db
						.insert(watchBlockedDomains)
						.values({ domain, reason: reason ?? null })
						.onConflictDoUpdate({
							target: watchBlockedDomains.domain,
							set: { reason: reason ?? null },
						})
						.returning({ domain: watchBlockedDomains.domain }),
					[
						sql`UPDATE watch_items SET visibility = 'removed', removed_reason = 'blocked_domain'
							WHERE (domain = ${domain} OR domain LIKE ${`%.${domain}`}) AND visibility <> 'removed'
							AND EXISTS (SELECT 1 FROM m)`,
					],
				);
				return { removedItems: Number(n) };
			},

			async unblockDomain(actorId: string, domain: string) {
				await withAudit(
					db,
					{
						actorId,
						action: "watch_domain.unblock",
						targetType: "watch_domain",
						targetIdColumn: "domain",
					},
					db
						.delete(watchBlockedDomains)
						.where(eq(watchBlockedDomains.domain, domain))
						.returning({ domain: watchBlockedDomains.domain }),
				);
			},
		},
	};
}

function decodeOffset(cursor: string | undefined) {
	if (cursor === undefined) {
		return 0;
	}
	const match = /^o(\d{1,5})$/.exec(cursor);
	if (!match) {
		throw new InvalidWatchCursorError();
	}
	return Number(match[1]);
}
