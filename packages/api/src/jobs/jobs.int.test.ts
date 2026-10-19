/// <reference types="bun" />
// Integration test of the Job postings and the Talent card (#258) against a real Postgres.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { user } from "@codesphere/db/schema/auth";
import {
	jobApplications,
	jobPostings,
	jobReports,
	talentCards,
} from "@codesphere/db/schema/jobs";
import { organization } from "@codesphere/db/schema/organizations";
import { tagFollows } from "@codesphere/db/schema/tags";
import { createRouterClient } from "@orpc/server";
import { eq, inArray, like, or } from "drizzle-orm";

import { deleteMember } from "../members-delete";
import { exportMember } from "../members-export";
import { appRouter } from "../routers";
import { testContext } from "../test-context";
import { createJobService } from "./service";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("jobs on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID().slice(0, 8);
	const admin = `it-job-admin-${run}`;
	const boss = `it-job-boss-${run}`;
	const other = `it-job-other-${run}`;
	const cand = `it-job-cand-${run}`;
	const bot = `it-job-bot-${run}`;
	const cand2 = other;
	const ids = [admin, boss, other, cand, bot];
	const tag = `jt-${run}`;
	const as = (id: string, role = "member", kind = "human") =>
		createRouterClient(appRouter, {
			context: testContext({
				db,
				session: {
					user: { id, role, kind },
					session: { id: "s" },
				} as unknown as Session,
			}),
		});
	const anonymous = () =>
		createRouterClient(appRouter, { context: testContext({ db }) });
	let orgSlug = "";
	let orgId = "";
	let pendingSlug = "";

	const posting = (over: Record<string, unknown> = {}) => ({
		organizationSlug: orgSlug,
		title: `Développeur ${run}`,
		description:
			"Nous cherchons une développeuse ou un développeur pour construire nos API.",
		tags: [tag, "sql"],
		country: "SN",
		remote: false,
		applyUrl: `https://jobs.${run}.example.org/apply`,
		...over,
	});

	beforeAll(async () => {
		await db.insert(user).values([
			{
				id: admin,
				name: "Job admin",
				email: `${admin}@example.com`,
				role: "admin",
			},
			{ id: boss, name: "Boss", email: `${boss}@example.com` },
			{ id: other, name: "Other", email: `${other}@example.com` },
			{
				id: cand,
				name: "Candidate",
				email: `${cand}@example.com`,
				country: "SN",
			},
			{
				id: bot,
				name: "Bot",
				email: `${bot}@example.com`,
				kind: "agent",
				ownerId: cand,
			},
		]);
		const [org, pending] = await db
			.insert(organization)
			.values([
				{
					slug: `job-org-${run}`,
					name: `Job Org ${run}`,
					website: `https://${run}.example.org`,
					country: "SN",
					status: "validated",
					ownerId: boss,
					validatedAt: new Date(),
				},
				{
					slug: `job-pending-${run}`,
					name: `Job Pending ${run}`,
					website: `https://p${run}.example.org`,
					country: "SN",
					status: "pending",
					ownerId: other,
				},
			])
			.returning({ id: organization.id, slug: organization.slug });
		orgId = org?.id ?? "";
		orgSlug = org?.slug ?? "";
		pendingSlug = pending?.slug ?? "";
	});

	afterAll(async () => {
		await db
			.delete(jobPostings)
			.where(inArray(jobPostings.organizationId, [orgId]));
		await db
			.delete(organization)
			.where(
				or(
					like(organization.slug, `job-%-${run}`),
					inArray(organization.ownerId, ids),
				),
			);
		await db.delete(talentCards).where(inArray(talentCards.userId, ids));
		await db.delete(tagFollows).where(inArray(tagFollows.userId, ids));
		await db.delete(auditLog).where(inArray(auditLog.actorId, ids));
		await db.delete(user).where(inArray(user.id, ids));
	});

	test("only the owner of a validated Organization publishes, with exactly one way to apply", async () => {
		await expect(
			as(other).jobs.publish(posting({ organizationSlug: pendingSlug })),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(as(other).jobs.publish(posting())).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(
			as(bot, "member", "agent").jobs.publish(posting()),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(anonymous().jobs.publish(posting())).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		await expect(
			as(boss).jobs.publish(posting({ applyUrl: undefined })),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			as(boss).jobs.publish(posting({ applyEmail: `rh@${run}.example.org` })),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		const ok = await as(boss).jobs.publish(posting());
		expect(ok).toMatchObject({
			country: "SN",
			organization: { slug: orgSlug },
			myApplication: null,
		});
		const days =
			(Date.parse(ok.expiresAt) - Date.parse(ok.publishedAt)) / 86_400_000;
		expect(days).toBe(30);
	});

	test("a posting that asks the candidate for money is refused", async () => {
		await expect(
			as(boss).jobs.publish(
				posting({
					description:
						"Poste ouvert à tous. Des frais de dossier de 10 000 FCFA sont à régler avant l'entretien.",
				}),
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("the list is public and filtered by country and Tag; an expired posting is not listed", async () => {
		const all = await anonymous().jobs.list({ limit: 50, tag });
		expect(
			all.items.filter((j) => j.organization.slug === orgSlug),
		).toHaveLength(1);
		expect(
			(await anonymous().jobs.list({ limit: 50, tag, country: "CI" })).items,
		).toEqual([]);
		expect(
			(await anonymous().jobs.list({ limit: 50, tag, country: "SN" })).items,
		).toHaveLength(1);
		// Thirty-one days later, the same posting is gone.
		const later = createJobService(
			db,
			() => new Date(Date.now() + 31 * 86_400_000),
		);
		expect((await later.list({ limit: 50, tag }, null)).items).toEqual([]);
		await expect(later.get(all.items[0]?.id ?? "", null)).rejects.toMatchObject(
			{ code: "NOT_FOUND" },
		);
	});

	test("an Organization keeps at most five live postings", async () => {
		for (let i = 0; i < 4; i++) {
			await as(boss).jobs.publish(posting({ title: `Poste ${i} ${run}` }));
		}
		await expect(
			as(boss).jobs.publish(posting({ title: `Poste de trop ${run}` })),
		).rejects.toMatchObject({ code: "CONFLICT" });
		const mine = await as(boss).jobs.mine({});
		expect(mine.items).toHaveLength(5);
		await as(boss).jobs.close({ id: mine.items[4]?.id ?? "" });
		await as(boss).jobs.publish(
			posting({ title: `Poste de remplacement ${run}` }),
		);
		await expect(
			as(other).jobs.close({ id: mine.items[0]?.id ?? "" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("applying through CodeSphere shares the card for that posting only", async () => {
		const [first, second] = (await as(boss).jobs.mine({})).items.filter(
			(j) => j.status === "published",
		);
		await expect(
			as(boss).jobs.applyTo({ id: first?.id ?? "", shareCard: true }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			as(bot, "member", "agent").jobs.applyTo({
				id: first?.id ?? "",
				shareCard: true,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		const applied = await as(cand).jobs.applyTo({
			id: first?.id ?? "",
			shareCard: true,
		});
		expect(applied.myApplication).toEqual({ sharedCard: true });
		await as(cand).jobs.applyTo({ id: second?.id ?? "", shareCard: false });

		const seen = await as(boss).jobs.applicants({ id: first?.id ?? "" });
		expect(seen.items[0]).toMatchObject({
			name: "Candidate",
			card: { name: "Candidate", country: "SN" },
		});
		const hidden = await as(boss).jobs.applicants({ id: second?.id ?? "" });
		expect(hidden.items[0]).toMatchObject({ name: "Candidate", card: null });
		await expect(
			as(other).jobs.applicants({ id: first?.id ?? "" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("the Talent card is off by default; the directory shows only those open to contact, to recruiters only", async () => {
		const mine = await as(cand).talent.mine({});
		expect(mine).toMatchObject({ enabled: false, openToContact: false });
		await expect(
			as(other).talent.directory({ limit: 50 }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(
			(await as(boss).talent.directory({ limit: 50 })).items.map((c) => c.name),
		).not.toContain("Candidate");

		await as(cand).talent.update({
			enabled: true,
			headline: "Backend",
			codeUrl: "https://github.com/cand",
		});
		expect(
			(await as(boss).talent.directory({ limit: 50 })).items.map((c) => c.name),
		).not.toContain("Candidate");
		const opened = await as(cand).talent.update({
			openToContact: true,
			contactEmail: "cand@example.com",
		});
		expect(opened).toMatchObject({
			enabled: true,
			openToContact: true,
			headline: "Backend",
		});
		const card = (await as(boss).talent.directory({ limit: 50 })).items.find(
			(c) => c.name === "Candidate",
		);
		expect(card).toMatchObject({
			headline: "Backend",
			codeUrl: "https://github.com/cand",
			contactEmail: "cand@example.com",
		});
		await as(cand).talent.update({ enabled: false });
		expect(
			(await as(boss).talent.directory({ limit: 50 })).items.map((c) => c.name),
		).not.toContain("Candidate");
	});

	test("jobs matching the followed Tags", async () => {
		await db.insert(tagFollows).values({ userId: cand, tag });
		const matching = await as(cand).jobs.matching({ limit: 3 });
		expect(matching.items.length).toBeGreaterThan(0);
		expect(matching.items.every((j) => j.tags.includes(tag))).toBe(true);
		await expect(anonymous().jobs.matching({ limit: 3 })).rejects.toMatchObject(
			{ code: "UNAUTHORIZED" },
		);
	});

	test("two founded reports on distinct postings suspend the Organization; a dismissed one does not", async () => {
		const live = (await as(boss).jobs.mine({})).items.filter(
			(j) => j.status === "published",
		);
		const [a, b, c] = live;
		await as(cand).jobs.report({
			id: a?.id ?? "",
			reason: "Demande de l'argent",
		});
		await as(other).jobs.report({ id: a?.id ?? "", reason: "Arnaque" });
		await as(cand).jobs.report({ id: c?.id ?? "", reason: "Spam" });
		const queue = await as(admin, "admin").admin.jobs.review({ limit: 50 });
		expect(queue.items.find((j) => j.id === a?.id)).toMatchObject({
			reports: 2,
		});
		await expect(
			as(cand).admin.jobs.review({ limit: 50 }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		await as(admin, "admin").admin.jobs.dismiss({ id: c?.id ?? "" });
		const first = await as(admin, "admin").admin.jobs.uphold({
			id: a?.id ?? "",
			reason: "Scam",
		});
		expect(first).toEqual({ organizationSuspended: false });
		expect(
			(await anonymous().jobs.list({ limit: 50, tag })).items.some(
				(j) => j.id === a?.id,
			),
		).toBe(false);

		await as(cand).jobs.report({ id: b?.id ?? "", reason: "Encore" });
		const second = await as(admin, "admin").admin.jobs.uphold({
			id: b?.id ?? "",
			reason: "Scam again",
		});
		expect(second).toEqual({ organizationSuspended: true });
		// A suspended Organization lists nothing and publishes nothing.
		expect((await anonymous().jobs.list({ limit: 50, tag })).items).toEqual([]);
		await expect(as(boss).jobs.publish(posting())).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		const [org] = await db
			.select()
			.from(organization)
			.where(eq(organization.id, orgId));
		expect(org?.status).toBe("suspended");
		const actions = (
			await db
				.select({ action: auditLog.action })
				.from(auditLog)
				.where(eq(auditLog.actorId, admin))
		).map((e) => e.action);
		for (const expected of [
			"job.uphold",
			"job.dismiss",
			"organization.suspend",
		]) {
			expect(actions).toContain(expected);
		}
	});

	test("links are http(s) only", async () => {
		await expect(
			as(boss).jobs.publish(posting({ applyUrl: "javascript:alert(1)" })),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			as(cand).talent.update({ codeUrl: "data:text/html,<script>1</script>" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			as(cand).organizations.request({
				name: `Evil ${run}`,
				website: "javascript:alert(1)",
				contactEmail: "a@b.co",
				country: "SN",
				description: "",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("the card and the applications are exported and deleted with the account", async () => {
		await as(cand).talent.update({ enabled: true, headline: "Backend" });
		const exported = await exportMember(db, cand);
		expect(exported?.talentCard).toMatchObject({
			enabled: true,
			headline: "Backend",
		});
		expect(exported?.jobApplications.length).toBeGreaterThan(0);
		await deleteMember(db, cand, false);
		expect(
			await db.select().from(talentCards).where(eq(talentCards.userId, cand)),
		).toEqual([]);
		expect(
			await db
				.select()
				.from(jobApplications)
				.where(eq(jobApplications.userId, cand)),
		).toEqual([]);
		expect(
			await db.select().from(jobReports).where(eq(jobReports.userId, cand)),
		).toEqual([]);
	});

	test("a dismissed report stays dismissed; deleting an owner takes their postings down", async () => {
		const owner = `it-job-owner2-${run}`;
		await db
			.insert(user)
			.values({ id: owner, name: "Owner2", email: `${owner}@example.com` });
		const [org] = await db
			.insert(organization)
			.values({
				slug: `job-owner2-${run}`,
				name: `Owner2 ${run}`,
				website: `https://o2${run}.example.org`,
				country: "SN",
				status: "validated",
				ownerId: owner,
				validatedAt: new Date(),
			})
			.returning({ slug: organization.slug, id: organization.id });
		try {
			const job = await as(owner).jobs.publish(
				posting({
					organizationSlug: org?.slug ?? "",
					title: `Owner2 job ${run}`,
				}),
			);
			await as(cand2).jobs.report({ id: job.id, reason: "Douteux" });
			await as(admin, "admin").admin.jobs.dismiss({ id: job.id });
			await as(cand2).jobs.report({ id: job.id, reason: "Encore douteux" });
			const queue = await as(admin, "admin").admin.jobs.review({ limit: 50 });
			expect(queue.items.some((j) => j.id === job.id)).toBe(false);

			await deleteMember(db, owner, false);
			await expect(anonymous().jobs.get({ id: job.id })).rejects.toMatchObject({
				code: "NOT_FOUND",
			});
			const [after] = await db
				.select()
				.from(organization)
				.where(eq(organization.id, org?.id ?? ""));
			expect(after).toMatchObject({
				status: "suspended",
				statusReason: "owner deleted",
			});
		} finally {
			await db
				.delete(jobPostings)
				.where(eq(jobPostings.organizationId, org?.id ?? ""));
			await db.delete(organization).where(eq(organization.id, org?.id ?? ""));
			await db.delete(auditLog).where(eq(auditLog.actorId, owner));
			await db.delete(user).where(eq(user.id, owner));
		}
	});
});
