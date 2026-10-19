import type {
	JobPosting,
	OwnTalentCard,
	TalentCardView,
} from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import {
	jobApplications,
	jobPostings,
	jobReports,
	talentCards,
} from "@codesphere/db/schema/jobs";
import { organization } from "@codesphere/db/schema/organizations";
import { tagFollows } from "@codesphere/db/schema/tags";
import {
	and,
	asc,
	desc,
	eq,
	gt,
	inArray,
	lt,
	or,
	type SQL,
	sql,
} from "drizzle-orm";

import { withAudit } from "../audit";
import { reputationsOf } from "../reputation/read";
import {
	applyChannel,
	asksCandidateForMoney,
	expiryOf,
	MAX_LIVE_POSTINGS,
	UPHELD_REPORTS_TO_SUSPEND,
} from "./rules";

export class JobError extends Error {
	constructor(
		readonly code: "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "BAD_REQUEST",
		readonly path?: string,
		readonly reason?: string,
	) {
		super(code);
	}
}

export class InvalidJobCursorError extends Error {}

type Viewer = { id: string } | null;

const encodeCursor = (at: Date, id: string) => `${at.getTime()}_${id}`;
function decodeCursor(cursor: string) {
	const match = /^(\d{1,15})_([0-9a-f-]{36})$/.exec(cursor);
	if (!match) {
		throw new InvalidJobCursorError();
	}
	return { at: new Date(Number(match[1])), id: match[2] as string };
}
function offsetOf(cursor: string | undefined) {
	if (cursor === undefined) {
		return 0;
	}
	const match = /^o(\d{1,5})$/.exec(cursor);
	if (!match) {
		throw new InvalidJobCursorError();
	}
	return Number(match[1]);
}

const rowsOf = <T>(result: unknown): T[] =>
	(Array.isArray(result)
		? result
		: (result as { rows: unknown[] }).rows) as T[];

export function createJobService(
	db: Database,
	now: () => Date = () => new Date(),
) {
	// A posting of a validated Organization that has not expired and was not removed.
	const live = () =>
		and(
			eq(jobPostings.status, "published"),
			gt(jobPostings.expiresAt, now()),
			eq(organization.status, "validated"),
		);

	const select = (viewer: Viewer) =>
		db
			.select({
				job: jobPostings,
				orgSlug: organization.slug,
				orgName: organization.name,
				applied: viewer
					? sql<
							boolean | null
						>`(SELECT a.shared_card FROM job_applications a WHERE a.job_id = ${jobPostings.id} AND a.user_id = ${viewer.id})`
					: sql<boolean | null>`NULL`,
			})
			.from(jobPostings)
			.innerJoin(organization, eq(organization.id, jobPostings.organizationId));

	type Row = Awaited<ReturnType<ReturnType<typeof select>["limit"]>>[number];

	const toPosting = (row: Row): JobPosting => ({
		id: row.job.id,
		title: row.job.title,
		description: row.job.description,
		tags: row.job.tags,
		country: row.job.country,
		remote: row.job.remote,
		applyUrl: row.job.applyUrl,
		applyEmail: row.job.applyEmail,
		organization: { slug: row.orgSlug, name: row.orgName },
		publishedAt: row.job.publishedAt.toISOString(),
		expiresAt: row.job.expiresAt.toISOString(),
		myApplication:
			row.applied === null ? null : { sharedCard: Boolean(row.applied) },
	});

	async function posting(id: string, viewer: Viewer, onlyLive = true) {
		const [row] = await select(viewer)
			.where(and(eq(jobPostings.id, id), onlyLive ? live() : undefined))
			.limit(1);
		if (!row) {
			throw new JobError("NOT_FOUND");
		}
		return toPosting(row);
	}

	/** The validated Organization `slug` when `userId` owns it. */
	async function ownedOrganization(userId: string, slug: string) {
		const [org] = await db
			.select()
			.from(organization)
			.where(
				and(
					eq(organization.slug, slug),
					eq(organization.ownerId, userId),
					eq(organization.status, "validated"),
				),
			)
			.limit(1);
		if (!org) {
			throw new JobError("FORBIDDEN");
		}
		return org;
	}

	/** Whether `userId` owns a validated Organization: the right to read the talent directory. */
	async function isRecruiter(userId: string) {
		const [row] = await db
			.select({ id: organization.id })
			.from(organization)
			.where(
				and(
					eq(organization.ownerId, userId),
					eq(organization.status, "validated"),
				),
			)
			.limit(1);
		return Boolean(row);
	}

	/** The three Tags each Member earned the most Reputation on, for several Members in one read. */
	async function strongestTagsOf(userIds: readonly string[]) {
		const out = new Map<string, string[]>();
		if (userIds.length === 0) {
			return out;
		}
		const result = await db.execute(sql`
			SELECT user_id, tag FROM (
				SELECT e.user_id, t AS tag,
					row_number() OVER (PARTITION BY e.user_id ORDER BY SUM(e.points) DESC, t) AS rank
				FROM reputation_events e
				LEFT JOIN answers a ON e.target_type = 'answer' AND a.id = e.target_id
				JOIN questions q ON q.id = CASE WHEN e.target_type = 'question' THEN e.target_id ELSE a.question_id END
				CROSS JOIN LATERAL unnest(q.tags) AS t
				WHERE e.user_id IN (${sql.join(
					userIds.map((id) => sql`${id}`),
					sql`, `,
				)})
					AND e.voided_reason IS NULL AND q.deleted_at IS NULL
				GROUP BY e.user_id, t HAVING SUM(e.points) > 0
			) ranked WHERE rank <= 3 ORDER BY user_id, rank`);
		for (const row of rowsOf<{ user_id: string; tag: string }>(result)) {
			out.set(row.user_id, [...(out.get(row.user_id) ?? []), row.tag]);
		}
		return out;
	}

	/**
	 * What a recruiter sees of several Members, in a handful of reads whatever their number. A
	 * suspended or non-human Member has no card to show.
	 */
	async function cardViews(
		userIds: readonly string[],
	): Promise<Map<string, TalentCardView>> {
		const out = new Map<string, TalentCardView>();
		if (userIds.length === 0) {
			return out;
		}
		const [members, stored, reputations, tags] = await Promise.all([
			db
				.select()
				.from(user)
				.where(
					and(
						inArray(user.id, [...userIds]),
						eq(user.kind, "human"),
						sql`${user.suspendedAt} IS NULL`,
					),
				),
			db
				.select()
				.from(talentCards)
				.where(inArray(talentCards.userId, [...userIds])),
			reputationsOf(db, userIds),
			strongestTagsOf(userIds),
		]);
		const cardOf = new Map(stored.map((c) => [c.userId, c]));
		for (const member of members) {
			const card = cardOf.get(member.id);
			out.set(member.id, {
				name: member.name,
				reputation: reputations.get(member.id) ?? 0,
				strongestTags: tags.get(member.id) ?? [],
				country: member.country,
				headline: card?.headline ?? null,
				codeUrl: card?.codeUrl ?? null,
				contactEmail: card?.contactEmail ?? null,
			});
		}
		return out;
	}

	async function cardView(userId: string): Promise<TalentCardView> {
		const view = (await cardViews([userId])).get(userId);
		if (!view) {
			throw new JobError("NOT_FOUND");
		}
		return view;
	}

	async function ownCard(userId: string): Promise<OwnTalentCard> {
		const [stored] = await db
			.select()
			.from(talentCards)
			.where(eq(talentCards.userId, userId));
		return {
			enabled: stored?.enabled ?? false,
			openToContact: stored?.openToContact ?? false,
			headline: stored?.headline ?? null,
			codeUrl: stored?.codeUrl ?? null,
			contactEmail: stored?.contactEmail ?? null,
			preview: await cardView(userId),
		};
	}

	return {
		get: (id: string, viewer: Viewer) => posting(id, viewer),

		async list(
			filter: {
				country?: string;
				tag?: string;
				remote?: boolean;
				cursor?: string;
				limit: number;
			},
			viewer: Viewer,
			extra?: SQL,
		) {
			const conditions: (SQL | undefined)[] = [
				live(),
				extra,
				filter.country ? eq(jobPostings.country, filter.country) : undefined,
				filter.tag ? sql`${filter.tag} = ANY (${jobPostings.tags})` : undefined,
				filter.remote === undefined
					? undefined
					: eq(jobPostings.remote, filter.remote),
			];
			if (filter.cursor) {
				const { at, id } = decodeCursor(filter.cursor);
				conditions.push(
					or(
						lt(jobPostings.publishedAt, at),
						and(eq(jobPostings.publishedAt, at), lt(jobPostings.id, id)),
					),
				);
			}
			const rows = await select(viewer)
				.where(and(...conditions))
				.orderBy(desc(jobPostings.publishedAt), desc(jobPostings.id))
				.limit(filter.limit + 1);
			const page = rows.slice(0, filter.limit);
			const last = page.at(-1);
			return {
				items: page.map(toPosting),
				nextCursor:
					rows.length > filter.limit && last
						? encodeCursor(last.job.publishedAt, last.job.id)
						: null,
			};
		},

		/** Live postings on the Tags the Member follows. */
		async matching(userId: string, limit: number) {
			const followed = db
				.select({ tag: tagFollows.tag })
				.from(tagFollows)
				.where(eq(tagFollows.userId, userId));
			const { items } = await this.list(
				{ limit },
				{ id: userId },
				sql`${jobPostings.tags} && ARRAY(${followed})::text[]`,
			);
			return items;
		},

		async publish(
			userId: string,
			input: {
				organizationSlug: string;
				title: string;
				description: string;
				tags: string[];
				country: string;
				remote: boolean;
				applyUrl?: string;
				applyEmail?: string;
			},
		) {
			const org = await ownedOrganization(userId, input.organizationSlug);
			if (!applyChannel(input)) {
				throw new JobError(
					"BAD_REQUEST",
					"applyUrl",
					"Give exactly one of a link and an email to apply.",
				);
			}
			if (asksCandidateForMoney(`${input.title}\n${input.description}`)) {
				throw new JobError(
					"BAD_REQUEST",
					"description",
					"A posting cannot ask the candidate for money.",
				);
			}
			const [{ open } = { open: 0 }] = await db
				.select({ open: sql<number>`count(*)::int` })
				.from(jobPostings)
				.where(
					and(
						eq(jobPostings.organizationId, org.id),
						eq(jobPostings.status, "published"),
						gt(jobPostings.expiresAt, now()),
					),
				);
			if (Number(open) >= MAX_LIVE_POSTINGS) {
				throw new JobError("CONFLICT", "limit");
			}
			const at = now();
			const [created] = await db
				.insert(jobPostings)
				.values({
					organizationId: org.id,
					createdBy: userId,
					title: input.title,
					description: input.description,
					tags: [...new Set(input.tags)],
					country: input.country,
					remote: input.remote,
					applyUrl: input.applyUrl ?? null,
					applyEmail: input.applyEmail?.toLowerCase() ?? null,
					publishedAt: at,
					expiresAt: expiryOf(at),
				})
				.returning({ id: jobPostings.id });
			if (!created) {
				throw new JobError("CONFLICT");
			}
			return posting(created.id, { id: userId });
		},

		async close(userId: string, id: string) {
			const rows = await db
				.update(jobPostings)
				.set({
					status: "removed",
					removedReason: "closed by the Organization",
					version: sql`${jobPostings.version} + 1`,
				})
				.where(
					and(
						eq(jobPostings.id, id),
						eq(jobPostings.status, "published"),
						inArray(
							jobPostings.organizationId,
							db
								.select({ id: organization.id })
								.from(organization)
								.where(eq(organization.ownerId, userId)),
						),
					),
				)
				.returning({ id: jobPostings.id });
			if (rows.length === 0) {
				throw new JobError("NOT_FOUND");
			}
		},

		async applyTo(userId: string, id: string, shareCard: boolean) {
			const job = await posting(id, { id: userId });
			const [owner] = await db
				.select({ ownerId: organization.ownerId })
				.from(organization)
				.where(eq(organization.slug, job.organization.slug));
			if (owner?.ownerId === userId) {
				throw new JobError("FORBIDDEN");
			}
			await db
				.insert(jobApplications)
				.values({ userId, jobId: id, sharedCard: shareCard })
				.onConflictDoUpdate({
					target: [jobApplications.userId, jobApplications.jobId],
					set: { sharedCard: shareCard },
				});
			return posting(id, { id: userId });
		},

		async report(userId: string, id: string, reason: string) {
			await posting(id, { id: userId });
			await db
				.insert(jobReports)
				.values({ userId, jobId: id, reason })
				.onConflictDoUpdate({
					target: [jobReports.userId, jobReports.jobId],
					set: { reason },
					// Re-reporting only edits a report still waiting: an Admin's decision stands.
					setWhere: sql`${jobReports.outcome} IS NULL`,
				});
		},

		async mine(userId: string) {
			const rows = await select({ id: userId })
				.where(
					inArray(
						jobPostings.organizationId,
						db
							.select({ id: organization.id })
							.from(organization)
							.where(eq(organization.ownerId, userId)),
					),
				)
				.orderBy(desc(jobPostings.publishedAt));
			const counts = await db
				.select({ jobId: jobApplications.jobId, n: sql<number>`count(*)::int` })
				.from(jobApplications)
				.where(
					inArray(
						jobApplications.jobId,
						rows
							.map((r) => r.job.id)
							.concat("00000000-0000-0000-0000-000000000000"),
					),
				)
				.groupBy(jobApplications.jobId);
			const countOf = new Map(counts.map((c) => [c.jobId, Number(c.n)]));
			return rows.map((row) => ({
				...toPosting(row),
				status: row.job.status,
				expired: row.job.expiresAt <= now(),
				applicants: countOf.get(row.job.id) ?? 0,
			}));
		},

		async applicants(userId: string, id: string) {
			const [job] = await db
				.select({ id: jobPostings.id })
				.from(jobPostings)
				.innerJoin(
					organization,
					eq(organization.id, jobPostings.organizationId),
				)
				.where(and(eq(jobPostings.id, id), eq(organization.ownerId, userId)))
				.limit(1);
			if (!job) {
				throw new JobError("NOT_FOUND");
			}
			const rows = await db
				.select({
					userId: jobApplications.userId,
					name: user.name,
					sharedCard: jobApplications.sharedCard,
					createdAt: jobApplications.createdAt,
				})
				.from(jobApplications)
				.innerJoin(user, eq(user.id, jobApplications.userId))
				.where(eq(jobApplications.jobId, id))
				.orderBy(asc(jobApplications.createdAt));
			// The card is shown for this posting only, and never for a Member since suspended.
			const cards = await cardViews(
				rows.filter((r) => r.sharedCard).map((r) => r.userId),
			);
			return rows.map((row) => ({
				name: row.name,
				appliedAt: row.createdAt.toISOString(),
				card: row.sharedCard ? (cards.get(row.userId) ?? null) : null,
			}));
		},

		talent: {
			mine: ownCard,

			async update(
				userId: string,
				patch: {
					enabled?: boolean;
					openToContact?: boolean;
					headline?: string | null;
					codeUrl?: string | null;
					contactEmail?: string | null;
				},
			) {
				// Only the fields given are written, in one statement.
				const changes = Object.fromEntries(
					Object.entries(patch).filter(([, value]) => value !== undefined),
				);
				await db
					.insert(talentCards)
					.values({ userId, ...changes })
					.onConflictDoUpdate({
						target: talentCards.userId,
						set: { ...changes, updatedAt: new Date() },
					});
				return ownCard(userId);
			},

			/** Members who turned their card on and opened themselves to contact: for recruiters only. */
			async directory(
				userId: string,
				page: { cursor?: string; limit: number },
			) {
				if (!(await isRecruiter(userId))) {
					throw new JobError("FORBIDDEN");
				}
				const offset = offsetOf(page.cursor);
				const rows = await db
					.select({ userId: talentCards.userId, card: talentCards })
					.from(talentCards)
					.innerJoin(user, eq(user.id, talentCards.userId))
					.where(
						and(
							eq(talentCards.enabled, true),
							eq(talentCards.openToContact, true),
							eq(user.kind, "human"),
							sql`${user.suspendedAt} IS NULL`,
						),
					)
					// A stable order: an edit must not move a card between pages.
					.orderBy(asc(user.createdAt), asc(talentCards.userId))
					.limit(page.limit + 1)
					.offset(offset);
				return {
					items: await (async () => {
						const slice = rows.slice(0, page.limit);
						const cards = await cardViews(slice.map((r) => r.userId));
						return slice.flatMap((r) => {
							const view = cards.get(r.userId);
							return view ? [view] : [];
						});
					})(),
					nextCursor:
						rows.length > page.limit ? `o${offset + page.limit}` : null,
				};
			},
		},

		admin: {
			async review(page: { cursor?: string; limit: number }) {
				const offset = offsetOf(page.cursor);
				const reports = sql<number>`(SELECT count(*)::int FROM job_reports r WHERE r.job_id = ${jobPostings.id} AND r.outcome IS NULL)`;
				const rows = await select(null)
					.where(sql`${reports} > 0`)
					.orderBy(asc(jobPostings.publishedAt), asc(jobPostings.id))
					.limit(page.limit + 1)
					.offset(offset);
				const slice = rows.slice(0, page.limit);
				const reasons = await db
					.select({ jobId: jobReports.jobId, reason: jobReports.reason })
					.from(jobReports)
					.where(
						and(
							inArray(
								jobReports.jobId,
								slice
									.map((r) => r.job.id)
									.concat("00000000-0000-0000-0000-000000000000"),
							),
							sql`${jobReports.outcome} IS NULL`,
						),
					);
				return {
					items: slice.map((row) => {
						const mine = reasons
							.filter((r) => r.jobId === row.job.id)
							.map((r) => r.reason);
						return {
							...toPosting(row),
							status: row.job.status,
							reports: mine.length,
							reasons: mine,
						};
					}),
					nextCursor:
						rows.length > page.limit ? `o${offset + page.limit}` : null,
				};
			},

			/**
			 * The reports on a posting are founded: it is removed and they are closed as upheld, in one
			 * statement with its audit event. When this makes two founded postings for the Organization,
			 * the Organization is suspended (its own audit event).
			 */
			async uphold(actorId: string, id: string, reason: string) {
				const rows = await withAudit(
					db,
					{
						actorId,
						action: "job.uphold",
						targetType: "job",
						targetIdColumn: "id",
						details: { fields: ["status"] },
					},
					db
						.update(jobPostings)
						.set({
							status: "removed",
							removedReason: reason,
							version: sql`${jobPostings.version} + 1`,
						})
						.where(
							and(
								eq(jobPostings.id, id),
								sql`EXISTS (SELECT 1 FROM job_reports r WHERE r.job_id = ${jobPostings.id} AND r.outcome IS NULL)`,
							),
						)
						.returning({
							id: jobPostings.id,
							organizationId: jobPostings.organizationId,
						}),
					[
						sql`UPDATE job_reports SET outcome = 'upheld' WHERE job_id IN (SELECT id FROM m) AND outcome IS NULL`,
					],
				);
				const organizationId = rows[0]?.organization_id as string | undefined;
				if (!organizationId) {
					throw new JobError("NOT_FOUND");
				}
				const [{ n } = { n: 0 }] = await db
					.select({ n: sql<number>`count(DISTINCT ${jobReports.jobId})::int` })
					.from(jobReports)
					.innerJoin(jobPostings, eq(jobPostings.id, jobReports.jobId))
					.where(
						and(
							eq(jobPostings.organizationId, organizationId),
							eq(jobReports.outcome, "upheld"),
						),
					);
				if (Number(n) < UPHELD_REPORTS_TO_SUSPEND) {
					return { organizationSuspended: false };
				}
				const suspended = await withAudit(
					db,
					{
						actorId,
						action: "organization.suspend",
						targetType: "organization",
						targetIdColumn: "id",
						details: { fields: ["status"] },
					},
					db
						.update(organization)
						.set({
							status: "suspended",
							statusReason: `${UPHELD_REPORTS_TO_SUSPEND} founded reports on its job postings`,
							reviewedBy: actorId,
							reviewedAt: new Date(),
							version: sql`${organization.version} + 1`,
						})
						.where(
							and(
								eq(organization.id, organizationId),
								eq(organization.status, "validated"),
							),
						)
						.returning({ id: organization.id }),
				);
				return { organizationSuspended: suspended.length > 0 };
			},

			async dismiss(actorId: string, id: string) {
				const rows = await withAudit(
					db,
					{
						actorId,
						action: "job.dismiss",
						targetType: "job",
						targetIdColumn: "id",
					},
					db
						.update(jobPostings)
						.set({ version: sql`${jobPostings.version} + 1` })
						.where(
							and(
								eq(jobPostings.id, id),
								sql`EXISTS (SELECT 1 FROM job_reports r WHERE r.job_id = ${jobPostings.id} AND r.outcome IS NULL)`,
							),
						)
						.returning({ id: jobPostings.id }),
					[
						sql`UPDATE job_reports SET outcome = 'dismissed' WHERE job_id IN (SELECT id FROM m) AND outcome IS NULL`,
					],
				);
				if (rows.length === 0) {
					throw new JobError("NOT_FOUND");
				}
			},
		},
	};
}
