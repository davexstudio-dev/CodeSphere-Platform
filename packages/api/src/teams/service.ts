import type { Submission, Team } from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import { account, user } from "@codesphere/db/schema/auth";
import {
	hackathon,
	hackathonMilestone,
} from "@codesphere/db/schema/hackathons";
import {
	hackathonSubmissions,
	hackathonTeamInvites,
	hackathonTeamMembers,
	hackathonTeams,
} from "@codesphere/db/schema/teams";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { withAudit } from "../audit";
import { sanitizeMarkdown } from "../markdown/sanitizer";
import type { RepoCheck } from "./repo-check";
import { deadlinesOf, isOpen, newInviteToken } from "./rules";

export class TeamError extends Error {
	constructor(
		readonly code:
			| "NOT_FOUND"
			| "FORBIDDEN"
			| "CONFLICT"
			| "CLOSED"
			| "ALREADY_IN_TEAM"
			| "TEAM_FULL"
			| "BAD_REQUEST",
		readonly path?: string,
	) {
		super(code);
	}
}

export class InvalidTeamCursorError extends Error {}

const constraintOf = (error: unknown): string | undefined => {
	const { code, constraint, cause } = (error ?? {}) as {
		code?: unknown;
		constraint?: unknown;
		cause?: unknown;
	};
	if (code === "23505" && typeof constraint === "string") {
		return constraint;
	}
	return cause === undefined ? undefined : constraintOf(cause);
};

const rowsOf = <T>(result: unknown): T[] =>
	(Array.isArray(result)
		? result
		: (result as { rows: unknown[] }).rows) as T[];

export type TeamDeps = {
	now?: () => Date;
	/** Reads a repository's first commit; GitHub's API when absent. */
	repoCheck?: RepoCheck;
	/** Submitting needs a GitHub account linked to the Member (#261). Off by default. */
	requireGithub?: boolean;
};

export function createTeamService(db: Database, deps: TeamDeps = {}) {
	const now = () => (deps.now ?? (() => new Date()))();

	async function hackathonBySlug(slug: string) {
		const [row] = await db
			.select()
			.from(hackathon)
			.where(eq(hackathon.slug, slug));
		if (!row) {
			throw new TeamError("NOT_FOUND");
		}
		const milestones = await db
			.select({
				key: hackathonMilestone.key,
				startsAt: hackathonMilestone.startsAt,
			})
			.from(hackathonMilestone)
			.where(eq(hackathonMilestone.hackathonId, row.id));
		const dates = deadlinesOf(
			milestones.map((m) => ({
				key: m.key,
				startsAt: m.startsAt.toISOString(),
			})),
		);
		return { ...row, ...dates };
	}

	async function teamRow(teamId: string) {
		const [team] = await db
			.select()
			.from(hackathonTeams)
			.where(eq(hackathonTeams.id, teamId));
		if (!team) {
			throw new TeamError("NOT_FOUND");
		}
		return team;
	}

	/** The Hackathon of a Team, with its dates. */
	async function context(teamId: string) {
		const team = await teamRow(teamId);
		const [h] = await db
			.select({ slug: hackathon.slug })
			.from(hackathon)
			.where(eq(hackathon.id, team.hackathonId));
		return { team, hackathon: await hackathonBySlug(h?.slug ?? "") };
	}

	async function requireMember(userId: string, teamId: string) {
		const ctx = await context(teamId);
		const [member] = await db
			.select({ userId: hackathonTeamMembers.userId })
			.from(hackathonTeamMembers)
			.where(
				and(
					eq(hackathonTeamMembers.teamId, teamId),
					eq(hackathonTeamMembers.userId, userId),
				),
			);
		if (!member) {
			throw new TeamError("NOT_FOUND");
		}
		return ctx;
	}

	async function requireCaptain(userId: string, teamId: string) {
		const ctx = await context(teamId);
		if (ctx.team.captainId !== userId) {
			// Not the captain: told apart from an unknown Team only for a member.
			const [member] = await db
				.select({ userId: hackathonTeamMembers.userId })
				.from(hackathonTeamMembers)
				.where(
					and(
						eq(hackathonTeamMembers.teamId, teamId),
						eq(hackathonTeamMembers.userId, userId),
					),
				);
			throw new TeamError(member ? "FORBIDDEN" : "NOT_FOUND");
		}
		return ctx;
	}

	const requireRegistrationOpen = (h: { registrationClose: Date | null }) => {
		if (!isOpen(h.registrationClose, now())) {
			throw new TeamError("CLOSED");
		}
	};

	async function submissionOf(
		teamId: string,
		closed: boolean,
	): Promise<Submission | null> {
		const [row] = await db
			.select({ s: hackathonSubmissions, teamName: hackathonTeams.name })
			.from(hackathonSubmissions)
			.innerJoin(
				hackathonTeams,
				eq(hackathonTeams.id, hackathonSubmissions.teamId),
			)
			.where(eq(hackathonSubmissions.teamId, teamId));
		if (!row) {
			return null;
		}
		const members = await memberNames([teamId]);
		return toSubmission(row.s, row.teamName, members.get(teamId) ?? [], closed);
	}

	async function memberNames(teamIds: string[]) {
		const out = new Map<string, string[]>();
		if (teamIds.length === 0) {
			return out;
		}
		const rows = await db
			.select({ teamId: hackathonTeamMembers.teamId, name: user.name })
			.from(hackathonTeamMembers)
			.innerJoin(user, eq(user.id, hackathonTeamMembers.userId))
			.where(inArray(hackathonTeamMembers.teamId, teamIds))
			.orderBy(asc(hackathonTeamMembers.joinedAt));
		for (const row of rows) {
			out.set(row.teamId, [...(out.get(row.teamId) ?? []), row.name]);
		}
		return out;
	}

	const toSubmission = (
		s: typeof hackathonSubmissions.$inferSelect,
		teamName: string,
		members: string[],
		frozen: boolean,
	): Submission => ({
		id: s.id,
		teamId: s.teamId,
		teamName,
		members,
		title: s.title,
		description: s.description,
		descriptionHtml: s.descriptionHtml,
		repoUrl: s.repoUrl,
		demoUrl: s.demoUrl,
		videoUrl: s.videoUrl,
		tags: s.tags,
		version: s.version,
		updatedAt: s.updatedAt.toISOString(),
		frozen,
	});

	/** A Team as one of its members sees it. */
	async function view(teamId: string, viewerId: string): Promise<Team> {
		const { team, hackathon: h } = await context(teamId);
		const members = await db
			.select({ id: user.id, name: user.name })
			.from(hackathonTeamMembers)
			.innerJoin(user, eq(user.id, hackathonTeamMembers.userId))
			.where(eq(hackathonTeamMembers.teamId, teamId))
			.orderBy(asc(hackathonTeamMembers.joinedAt));
		const captain = viewerId === team.captainId;
		const pending = captain
			? await db
					.select({ name: user.name })
					.from(hackathonTeamInvites)
					.innerJoin(user, eq(user.id, hackathonTeamInvites.userId))
					.where(eq(hackathonTeamInvites.teamId, teamId))
			: [];
		const submissionOpen = isOpen(h.submissionClose, now());
		return {
			id: team.id,
			hackathonSlug: h.slug,
			name: team.name,
			captainId: team.captainId,
			members: members.map((m) => ({
				...m,
				isCaptain: m.id === team.captainId,
			})),
			maxMembers: h.teamMax,
			inviteToken: captain ? team.inviteToken : null,
			pendingInvites: pending.map((p) => p.name),
			registrationOpen: isOpen(h.registrationClose, now()),
			submissionOpen,
			submission: await submissionOf(teamId, !submissionOpen),
		};
	}

	/**
	 * Adds a Member to a Team in ONE statement: the Team's `member_count` is raised only below the
	 * maximum, and the membership row is written next to it. The database's one-Team-per-Hackathon
	 * constraint refuses a second Team, and a full Team matches no row.
	 */
	async function addMember(userId: string, teamId: string, max: number) {
		try {
			const rows = rowsOf<{ id: string }>(
				await db.execute(sql`
					WITH t AS (
						UPDATE hackathon_teams SET member_count = member_count + 1
						WHERE id = ${teamId}::uuid AND member_count < ${max}
						RETURNING id, hackathon_id
					), m AS (
						INSERT INTO hackathon_team_members (team_id, hackathon_id, user_id)
						SELECT id, hackathon_id, ${userId} FROM t RETURNING team_id
					)
					SELECT team_id AS id FROM m`),
			);
			if (rows.length === 0) {
				throw new TeamError("TEAM_FULL");
			}
		} catch (error) {
			if (constraintOf(error)?.startsWith("hackathon_team_members")) {
				throw new TeamError("ALREADY_IN_TEAM");
			}
			throw error;
		}
	}

	async function removeMemberRow(userId: string, teamId: string) {
		await db.execute(sql`
			WITH gone AS (
				DELETE FROM hackathon_team_members WHERE team_id = ${teamId}::uuid AND user_id = ${userId} RETURNING team_id
			)
			UPDATE hackathon_teams SET member_count = member_count - 1
			WHERE id IN (SELECT team_id FROM gone)`);
	}

	return {
		view,

		async mine(userId: string, slug: string) {
			const h = await hackathonBySlug(slug);
			const [row] = await db
				.select({ teamId: hackathonTeamMembers.teamId })
				.from(hackathonTeamMembers)
				.where(
					and(
						eq(hackathonTeamMembers.hackathonId, h.id),
						eq(hackathonTeamMembers.userId, userId),
					),
				);
			return row ? view(row.teamId, userId) : null;
		},

		async create(userId: string, slug: string, name: string) {
			const h = await hackathonBySlug(slug);
			requireRegistrationOpen(h);
			try {
				const rows = rowsOf<{ id: string }>(
					await db.execute(sql`
						WITH t AS (
							INSERT INTO hackathon_teams (hackathon_id, name, captain_id, invite_token)
							VALUES (${h.id}::uuid, ${name}, ${userId}, ${newInviteToken()})
							RETURNING id, hackathon_id
						), m AS (
							INSERT INTO hackathon_team_members (team_id, hackathon_id, user_id)
							SELECT id, hackathon_id, ${userId} FROM t
						)
						SELECT id FROM t`),
				);
				return view(rows[0]?.id ?? "", userId);
			} catch (error) {
				const constraint = constraintOf(error);
				if (constraint?.startsWith("hackathon_team_members")) {
					throw new TeamError("ALREADY_IN_TEAM");
				}
				if (constraint === "hackathon_teams_name") {
					throw new TeamError("CONFLICT", "name");
				}
				throw error;
			}
		},

		async joinByLink(userId: string, token: string) {
			const [team] = await db
				.select()
				.from(hackathonTeams)
				.where(eq(hackathonTeams.inviteToken, token));
			if (!team) {
				throw new TeamError("NOT_FOUND");
			}
			const { hackathon: h } = await context(team.id);
			requireRegistrationOpen(h);
			await addMember(userId, team.id, h.teamMax);
			return view(team.id, userId);
		},

		/** An invitation by name: exact name, one Member; the invited Member answers. */
		async invite(captainId: string, teamId: string, name: string) {
			const { hackathon: h, team } = await requireCaptain(captainId, teamId);
			requireRegistrationOpen(h);
			const matches = await db
				.select({ id: user.id })
				.from(user)
				.where(
					and(
						sql`lower(${user.name}) = ${name.toLowerCase()}`,
						eq(user.kind, "human"),
						sql`${user.suspendedAt} IS NULL`,
					),
				)
				.limit(2);
			if (matches.length === 0) {
				throw new TeamError("NOT_FOUND", "name");
			}
			if (matches.length > 1) {
				// Names are not unique: the link is the way for a namesake.
				throw new TeamError("CONFLICT", "ambiguous");
			}
			const target = matches[0]?.id ?? "";
			const [already] = await db
				.select({ id: hackathonTeamMembers.userId })
				.from(hackathonTeamMembers)
				.where(
					and(
						eq(hackathonTeamMembers.hackathonId, team.hackathonId),
						eq(hackathonTeamMembers.userId, target),
					),
				);
			if (already) {
				throw new TeamError("ALREADY_IN_TEAM");
			}
			await db
				.insert(hackathonTeamInvites)
				.values({ teamId, userId: target, invitedBy: captainId })
				.onConflictDoNothing();
			return view(teamId, captainId);
		},

		async invitations(userId: string) {
			const rows = await db
				.select({
					teamId: hackathonTeams.id,
					teamName: hackathonTeams.name,
					slug: hackathon.slug,
					invitedByName: user.name,
				})
				.from(hackathonTeamInvites)
				.innerJoin(
					hackathonTeams,
					eq(hackathonTeams.id, hackathonTeamInvites.teamId),
				)
				.innerJoin(hackathon, eq(hackathon.id, hackathonTeams.hackathonId))
				.innerJoin(user, eq(user.id, hackathonTeamInvites.invitedBy))
				.where(eq(hackathonTeamInvites.userId, userId));
			return rows.map((r) => ({
				teamId: r.teamId,
				teamName: r.teamName,
				hackathonSlug: r.slug,
				invitedByName: r.invitedByName,
			}));
		},

		async respond(userId: string, teamId: string, accept: boolean) {
			const [invite] = await db
				.select()
				.from(hackathonTeamInvites)
				.where(
					and(
						eq(hackathonTeamInvites.teamId, teamId),
						eq(hackathonTeamInvites.userId, userId),
					),
				);
			if (!invite) {
				throw new TeamError("NOT_FOUND");
			}
			const forget = () =>
				db
					.delete(hackathonTeamInvites)
					.where(
						and(
							eq(hackathonTeamInvites.teamId, teamId),
							eq(hackathonTeamInvites.userId, userId),
						),
					);
			if (!accept) {
				await forget();
				return { team: null };
			}
			const { hackathon: h } = await context(teamId);
			requireRegistrationOpen(h);
			await addMember(userId, teamId, h.teamMax);
			await forget();
			return { team: await view(teamId, userId) };
		},

		async leave(userId: string, teamId: string) {
			const { team, hackathon: h } = await requireMember(userId, teamId);
			requireRegistrationOpen(h);
			if (team.captainId === userId) {
				// The captain leads until the Team is disbanded: handing over is not offered yet.
				throw new TeamError("FORBIDDEN");
			}
			await removeMemberRow(userId, teamId);
		},

		async removeMember(captainId: string, teamId: string, memberId: string) {
			const { team, hackathon: h } = await requireCaptain(captainId, teamId);
			requireRegistrationOpen(h);
			if (memberId === team.captainId) {
				throw new TeamError("FORBIDDEN");
			}
			await removeMemberRow(memberId, teamId);
			return view(teamId, captainId);
		},

		async rotateLink(captainId: string, teamId: string) {
			await requireCaptain(captainId, teamId);
			await db
				.update(hackathonTeams)
				.set({
					inviteToken: newInviteToken(),
					version: sql`${hackathonTeams.version} + 1`,
				})
				.where(eq(hackathonTeams.id, teamId));
			return view(teamId, captainId);
		},

		async disband(captainId: string, teamId: string) {
			const { hackathon: h } = await requireCaptain(captainId, teamId);
			requireRegistrationOpen(h);
			await db.delete(hackathonTeams).where(eq(hackathonTeams.id, teamId));
		},

		/**
		 * Creates or edits the Team's Submission until the submission deadline; from then on it is
		 * frozen (CLOSED). Any member may edit; the version guards two editors at once.
		 */
		async saveSubmission(
			userId: string,
			input: {
				teamId: string;
				title: string;
				description: string;
				repoUrl: string;
				demoUrl: string;
				videoUrl?: string | null;
				tags: string[];
				expectedVersion?: number;
			},
		) {
			const { hackathon: h, team } = await requireMember(userId, input.teamId);
			if (!isOpen(h.submissionClose, now())) {
				throw new TeamError("CLOSED");
			}
			if (deps.requireGithub) {
				const [linked] = await db
					.select({ id: account.id })
					.from(account)
					.where(
						and(eq(account.userId, userId), eq(account.providerId, "github")),
					)
					.limit(1);
				if (!linked) {
					throw new TeamError("FORBIDDEN", "github");
				}
			}
			const values = {
				title: input.title,
				description: input.description,
				descriptionHtml: sanitizeMarkdown(input.description).html,
				repoUrl: input.repoUrl,
				demoUrl: input.demoUrl,
				videoUrl: input.videoUrl ?? null,
				tags: [...new Set(input.tags)],
				// A new link is checked again.
				earlyCommitFlag: false,
				earlyCommitAt: null,
				checkedAt: null,
			};
			if (input.expectedVersion === undefined) {
				const created = await db
					.insert(hackathonSubmissions)
					.values({ ...values, teamId: team.id, hackathonId: team.hackathonId })
					.onConflictDoNothing({ target: hackathonSubmissions.teamId })
					.returning({ id: hackathonSubmissions.id });
				if (created.length === 0) {
					throw new TeamError("CONFLICT", "version");
				}
			} else {
				const updated = await db
					.update(hackathonSubmissions)
					.set({
						...values,
						version: sql`${hackathonSubmissions.version} + 1`,
						updatedAt: now(),
					})
					.where(
						and(
							eq(hackathonSubmissions.teamId, team.id),
							eq(hackathonSubmissions.version, input.expectedVersion),
						),
					)
					.returning({ id: hackathonSubmissions.id });
				if (updated.length === 0) {
					throw new TeamError("CONFLICT", "version");
				}
			}
			return view(team.id, userId);
		},

		/** The public gallery: nothing before the submission deadline, the frozen Submissions after. */
		async gallery(slug: string, page: { cursor?: string; limit: number }) {
			const h = await hackathonBySlug(slug);
			if (isOpen(h.submissionClose, now())) {
				return { open: false, items: [] as Submission[], nextCursor: null };
			}
			const match =
				page.cursor === undefined ? [] : /^o(\d{1,5})$/.exec(page.cursor);
			if (page.cursor !== undefined && !match) {
				throw new InvalidTeamCursorError();
			}
			const offset = match ? Number(match[1]) : 0;
			const rows = await db
				.select({ s: hackathonSubmissions, teamName: hackathonTeams.name })
				.from(hackathonSubmissions)
				.innerJoin(
					hackathonTeams,
					eq(hackathonTeams.id, hackathonSubmissions.teamId),
				)
				.where(eq(hackathonSubmissions.hackathonId, h.id))
				.orderBy(
					asc(hackathonSubmissions.createdAt),
					asc(hackathonSubmissions.id),
				)
				.limit(page.limit + 1)
				.offset(offset);
			const slice = rows.slice(0, page.limit);
			const names = await memberNames(slice.map((r) => r.s.teamId));
			return {
				open: true,
				items: slice.map((r) =>
					toSubmission(r.s, r.teamName, names.get(r.s.teamId) ?? [], true),
				),
				nextCursor: rows.length > page.limit ? `o${offset + page.limit}` : null,
			};
		},

		admin: {
			/**
			 * Reads the first commit of every Submission's repository and flags those older than the
			 * Hackathon's opening. A repository that cannot be read (not on GitHub, private, rate limit)
			 * is left unchecked, not accused. Audited as one event.
			 */
			async checkRepositories(actorId: string, slug: string, check: RepoCheck) {
				const h = await hackathonBySlug(slug);
				const rows = await db
					.select({
						id: hackathonSubmissions.id,
						repoUrl: hackathonSubmissions.repoUrl,
					})
					.from(hackathonSubmissions)
					.where(eq(hackathonSubmissions.hackathonId, h.id));
				let checked = 0;
				let flagged = 0;
				for (const row of rows) {
					let first: Date | null = null;
					try {
						first = await check(row.repoUrl);
					} catch {
						first = null;
					}
					if (!first || !h.opensAt) {
						continue;
					}
					const early = first.getTime() < h.opensAt.getTime();
					await db
						.update(hackathonSubmissions)
						.set({
							earlyCommitFlag: early,
							earlyCommitAt: first,
							checkedAt: now(),
						})
						.where(eq(hackathonSubmissions.id, row.id));
					checked++;
					if (early) {
						flagged++;
					}
				}
				await withAudit(
					db,
					{
						actorId,
						action: "hackathon.check_repositories",
						targetType: "hackathon",
						targetIdColumn: "id",
						details: { fields: ["submissions"] },
					},
					db
						.update(hackathon)
						.set({ version: sql`${hackathon.version}` })
						.where(eq(hackathon.id, h.id))
						.returning({ id: hackathon.id }),
				);
				return { checked, flagged, unchecked: rows.length - checked };
			},

			async flagged(slug: string) {
				const h = await hackathonBySlug(slug);
				const rows = await db
					.select({ s: hackathonSubmissions, teamName: hackathonTeams.name })
					.from(hackathonSubmissions)
					.innerJoin(
						hackathonTeams,
						eq(hackathonTeams.id, hackathonSubmissions.teamId),
					)
					.where(
						and(
							eq(hackathonSubmissions.hackathonId, h.id),
							eq(hackathonSubmissions.earlyCommitFlag, true),
						),
					);
				return rows.map((r) => ({
					id: r.s.id,
					teamName: r.teamName,
					title: r.s.title,
					repoUrl: r.s.repoUrl,
					earlyCommitAt: r.s.earlyCommitAt
						? r.s.earlyCommitAt.toISOString()
						: null,
				}));
			},
		},
	};
}
