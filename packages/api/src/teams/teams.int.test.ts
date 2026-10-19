/// <reference types="bun" />
// Integration test of the Teams and Submissions of a Hackathon (#261) against a real Postgres.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { account, user } from "@codesphere/db/schema/auth";
import { hackathon } from "@codesphere/db/schema/hackathons";
import { organization } from "@codesphere/db/schema/organizations";
import { cadev2026 } from "@codesphere/db/seed/cadev";
import { seedHackathon } from "@codesphere/db/seed/seed";
import { createRouterClient } from "@orpc/server";
import { eq, inArray, like } from "drizzle-orm";

import { appRouter } from "../routers";
import { testContext } from "../test-context";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("teams on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID().slice(0, 8);
	const slug = `it-team-${run}`;
	const slug2 = `it-team2-${run}`;
	const admin = `it-team-admin-${run}`;
	const members = ["ana", "ben", "cai", "dee", "eli", "fay"].map(
		(n) => `it-team-${n}-${run}`,
	);
	const [ana, ben, cai, dee, eli, fay] = members as [
		string,
		string,
		string,
		string,
		string,
		string,
	];
	const ids = [admin, ...members];
	const CLOSE = new Date("2099-06-30T12:00:00Z");
	let now = new Date("2099-06-01T00:00:00Z");
	let repoDates: Record<string, Date | null> = {};
	let requireGithub = false;

	const as = (id: string, role = "member") =>
		createRouterClient(appRouter, {
			context: testContext({
				db,
				session: {
					user: { id: id, role, kind: "human" },
					session: { id: "s" },
				} as unknown as Session,
				teamDeps: {
					now: () => now,
					requireGithub,
					repoCheck: async (repoUrl) => repoDates[repoUrl] ?? null,
				},
			}),
		});
	const anonymous = () =>
		createRouterClient(appRouter, {
			context: testContext({ db, teamDeps: { now: () => now } }),
		});
	const teamOf = async (id: string, hackathonSlug = slug) => {
		const team = await as(id).teams.mine({ slug: hackathonSlug });
		if (!team) {
			throw new Error(`no team for ${id}`);
		}
		return team;
	};
	const submission = (teamId: string, over: Record<string, unknown> = {}) => ({
		teamId,
		title: `Projet ${run}`,
		description:
			"Une application de paiement hors ligne pour les marchés de quartier.",
		repoUrl: "https://github.com/acme/projet",
		demoUrl: "https://projet.example.com",
		tags: ["mobile-money"],
		...over,
	});

	beforeAll(async () => {
		await db.insert(user).values([
			{
				id: admin,
				name: "Team admin",
				email: `${admin}@example.com`,
				role: "admin",
			},
			...members.map((id, i) => ({
				id,
				name:
					i === 4
						? "Twin Name"
						: i === 5
							? "Twin Name"
							: `Member ${["Ana", "Ben", "Cai", "Dee"][i] ?? "x"} ${run}`,
				email: `${id}@example.com`,
			})),
		]);
		const milestones = [
			{
				key: "submission_close",
				label: "Clôture",
				startsAt: CLOSE,
				endsAt: null,
			},
		];
		for (const s of [slug, slug2]) {
			await seedHackathon(db, {
				...cadev2026,
				slug: s,
				organizer: `Team Org ${run}`,
				teamMin: 1,
				teamMax: 3,
				milestones,
			});
		}
		await db
			.update(hackathon)
			.set({ opensAt: new Date("2099-05-01T00:00:00Z") })
			.where(eq(hackathon.slug, slug));
	});

	afterAll(async () => {
		await db.delete(hackathon).where(like(hackathon.slug, `it-team%-${run}`));
		await db
			.delete(organization)
			.where(like(organization.slug, `team-org-${run}%`));
		await db.delete(account).where(inArray(account.userId, ids));
		await db.delete(auditLog).where(inArray(auditLog.actorId, ids));
		await db.delete(user).where(inArray(user.id, ids));
	});

	test("a Member cannot be in a second Team of the same Hackathon, but may in another Hackathon", async () => {
		const team = await as(ana).teams.create({ slug, name: `Alpha ${run}` });
		expect(team).toMatchObject({
			captainId: ana,
			maxMembers: 3,
			registrationOpen: true,
		});
		expect(team.inviteToken).not.toBeNull();
		await expect(
			as(ana).teams.create({ slug, name: `Beta ${run}` }),
		).rejects.toMatchObject({
			code: "CONFLICT",
			data: { reason: "already_in_team" },
		});
		await expect(
			as(ben).teams.create({ slug, name: `Alpha ${run}` }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(
			await as(ana).teams.create({ slug: slug2, name: `Alpha ${run}` }),
		).toMatchObject({ hackathonSlug: slug2 });
		await expect(
			anonymous().teams.create({ slug, name: "x1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	test("joining by link: only the captain sees the link, a Member already in a Team is refused, a full Team too", async () => {
		const mine = await as(ana).teams.mine({ slug });
		const token = mine?.inviteToken ?? "";
		const joined = await as(ben).teams.joinByLink({ token });
		expect(joined.members.map((m) => m.id)).toEqual([ana, ben]);
		expect(joined.inviteToken).toBeNull();
		await expect(as(ben).teams.joinByLink({ token })).rejects.toMatchObject({
			code: "CONFLICT",
			data: { reason: "already_in_team" },
		});
		await as(cai).teams.joinByLink({ token });
		await expect(as(dee).teams.joinByLink({ token })).rejects.toMatchObject({
			code: "CONFLICT",
			data: { reason: "team_full" },
		});
		await expect(
			as(dee).teams.joinByLink({ token: "not-a-real-token-at-all" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("members leave, the captain removes and cannot leave, the link can be replaced", async () => {
		const team = await teamOf(ana);
		await expect(
			as(ana).teams.leave({ teamId: team.id }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			as(ben).teams.removeMember({ teamId: team.id, memberId: cai }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		const left = await as(ana).teams.removeMember({
			teamId: team.id,
			memberId: cai,
		});
		expect(left.members.map((m) => m.id)).toEqual([ana, ben]);
		await as(ben).teams.leave({ teamId: team.id });
		const rotated = await as(ana).teams.rotateLink({ teamId: team.id });
		expect(rotated.inviteToken).not.toBe(team.inviteToken);
		await expect(
			as(dee).teams.joinByLink({ token: team.inviteToken ?? "" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		// Back in a Team of their own, the Member is free again.
		expect(
			await as(cai).teams.create({ slug, name: `Gamma ${run}` }),
		).toMatchObject({ captainId: cai });
		await as(cai).teams.disband({
			teamId: (await teamOf(cai)).id,
		});
		expect(await as(cai).teams.mine({ slug })).toBeNull();
	});

	test("two joins at once never overfill a Team", async () => {
		const team = await teamOf(ana);
		const results = await Promise.allSettled(
			[ben, cai, dee, eli, fay].map((id) =>
				as(id).teams.joinByLink({ token: team.inviteToken ?? "" }),
			),
		);
		const ok = results.filter((r) => r.status === "fulfilled").length;
		expect(ok).toBe(2);
		const after = await teamOf(ana);
		expect(after.members).toHaveLength(3);
		for (const id of [ben, cai, dee, eli, fay]) {
			const t = await as(id).teams.mine({ slug });
			if (t && t.id === team.id) continue;
			expect(t).toBeNull();
		}
		// Make room again for the next tests: those who got in leave.
		for (const m of after.members.filter((m) => m.id !== ana)) {
			await as(ana).teams.removeMember({ teamId: team.id, memberId: m.id });
		}
	});

	test("an invitation by name is accepted or declined; a namesake is ambiguous; an unknown name is not found", async () => {
		const team = await teamOf(ana);
		const invited = await as(ana).teams.invite({
			teamId: team.id,
			name: `member ben ${run}`,
		});
		expect(invited.pendingInvites).toEqual([`Member Ben ${run}`]);
		expect((await as(ben).teams.invitations({})).items[0]).toMatchObject({
			teamName: `Alpha ${run}`,
			hackathonSlug: slug,
		});
		await expect(
			as(ben).teams.invite({ teamId: team.id, name: "whoever" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		const accepted = await as(ben).teams.respond({
			teamId: team.id,
			accept: true,
		});
		expect(accepted.team?.members.map((m) => m.id)).toEqual([ana, ben]);
		expect((await as(ben).teams.invitations({})).items).toEqual([]);

		await expect(
			as(ana).teams.invite({ teamId: team.id, name: "twin name" }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await expect(
			as(ana).teams.invite({ teamId: team.id, name: "nobody at all" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			as(ana).teams.invite({ teamId: team.id, name: `Member Ben ${run}` }),
		).rejects.toMatchObject({
			code: "CONFLICT",
			data: { reason: "already_in_team" },
		});
		await as(ana).teams.invite({ teamId: team.id, name: `Member Dee ${run}` });
		expect(
			(await as(dee).teams.respond({ teamId: team.id, accept: false })).team,
		).toBeNull();
		await expect(
			as(dee).teams.respond({ teamId: team.id, accept: true }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("a submission is editable until the deadline, then frozen, and the gallery opens", async () => {
		const team = await teamOf(ana);
		await expect(
			as(dee).teams.saveSubmission(submission(team.id)),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		const saved = await as(ben).teams.saveSubmission(submission(team.id));
		expect(saved.submission).toMatchObject({
			title: `Projet ${run}`,
			version: 1,
			frozen: false,
		});
		expect(saved.submission?.descriptionHtml).toContain("<p>");
		await expect(
			as(ana).teams.saveSubmission(submission(team.id)),
		).rejects.toMatchObject({ code: "CONFLICT" });
		const edited = await as(ana).teams.saveSubmission(
			submission(team.id, { title: `Projet v2 ${run}`, expectedVersion: 1 }),
		);
		expect(edited.submission).toMatchObject({
			title: `Projet v2 ${run}`,
			version: 2,
		});
		await expect(
			as(ben).teams.saveSubmission(submission(team.id, { expectedVersion: 1 })),
		).rejects.toMatchObject({ code: "CONFLICT" });

		// Before the deadline: no gallery.
		expect(await anonymous().teams.gallery({ slug, limit: 20 })).toMatchObject({
			open: false,
			items: [],
		});
		// At the deadline: frozen.
		now = new Date(CLOSE);
		await expect(
			as(ana).teams.saveSubmission(
				submission(team.id, { title: "Trop tard", expectedVersion: 2 }),
			),
		).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "closed" } });
		const gallery = await anonymous().teams.gallery({ slug, limit: 20 });
		expect(gallery.open).toBe(true);
		expect(gallery.items[0]).toMatchObject({
			title: `Projet v2 ${run}`,
			frozen: true,
			teamName: `Alpha ${run}`,
		});
		expect(gallery.items[0]?.members).toEqual(
			[`Member Ana ${run}`.replace("Ana", "Ana"), `Member Ben ${run}`].sort(),
		);
		now = new Date("2099-06-01T00:00:00Z");
	});

	test("registration is closed at its deadline: nobody creates, joins or leaves", async () => {
		const team = await teamOf(ana);
		now = new Date(CLOSE);
		await expect(
			as(eli).teams.create({ slug, name: `Late ${run}` }),
		).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "closed" } });
		await expect(
			as(eli).teams.joinByLink({ token: team.inviteToken ?? "" }),
		).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "closed" } });
		await expect(
			as(ben).teams.leave({ teamId: team.id }),
		).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "closed" } });
		expect((await as(ana).teams.mine({ slug }))?.registrationOpen).toBe(false);
		now = new Date("2099-06-01T00:00:00Z");
	});

	test("repositories older than the opening are flagged for an Admin, unreadable ones are left alone", async () => {
		repoDates = {
			"https://github.com/acme/projet": new Date("2099-04-01T00:00:00Z"),
		};
		await expect(
			as(ana).admin.teams.checkRepositories({ slug }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(
			await as(admin, "admin").admin.teams.checkRepositories({ slug }),
		).toEqual({ checked: 1, flagged: 1, unchecked: 0 });
		const flagged = (await as(admin, "admin").admin.teams.flagged({ slug }))
			.items;
		expect(flagged[0]).toMatchObject({
			repoUrl: "https://github.com/acme/projet",
			earlyCommitAt: "2099-04-01T00:00:00.000Z",
		});

		repoDates = {
			"https://github.com/acme/projet": new Date("2099-05-15T00:00:00Z"),
		};
		expect(
			await as(admin, "admin").admin.teams.checkRepositories({ slug }),
		).toMatchObject({ flagged: 0 });
		expect(
			(await as(admin, "admin").admin.teams.flagged({ slug })).items,
		).toEqual([]);
		repoDates = {};
		expect(
			await as(admin, "admin").admin.teams.checkRepositories({ slug }),
		).toEqual({ checked: 0, flagged: 0, unchecked: 1 });
	});

	test("a GitHub account can be required to submit", async () => {
		const team = await teamOf(ana);
		requireGithub = true;
		await expect(
			as(ana).teams.saveSubmission(submission(team.id, { expectedVersion: 2 })),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await db.insert(account).values({
			id: `acc-${run}`,
			accountId: `gh-${run}`,
			providerId: "github",
			userId: ana,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		expect(
			(
				await as(ana).teams.saveSubmission(
					submission(team.id, { expectedVersion: 2 }),
				)
			).submission?.version,
		).toBe(3);
		requireGithub = false;
	});
});
