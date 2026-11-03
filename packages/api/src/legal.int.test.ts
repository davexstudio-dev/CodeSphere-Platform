/// <reference types="bun" />
// Integration test of the legal documents editor (#341), against a real Postgres; skipped without
// TEST_DATABASE_URL. The counters are global, so every test reads them before and after.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { user } from "@codesphere/db/schema/auth";
import {
	legalDocumentDraft,
	legalDocumentVersion,
} from "@codesphere/db/schema/legal";
import {
	organization,
	organizationTermsAcceptance,
} from "@codesphere/db/schema/organizations";
import { createRouterClient } from "@orpc/server";
import { and, eq, inArray } from "drizzle-orm";

import { appRouter } from "./routers";
import { testContext } from "./test-context";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("legal documents on Postgres (#341)", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID().slice(0, 8);
	const adminA = `it-legal-a-${run}`;
	const adminB = `it-legal-b-${run}`;
	const moderator = `it-legal-mod-${run}`;
	const member = `it-legal-member-${run}`;
	const owner = `it-legal-owner-${run}`;
	const ids = [adminA, adminB, moderator, member, owner];
	const as = (id: string, role: string) =>
		createRouterClient(appRouter, {
			context: testContext({
				db,
				session: {
					user: { id, role, kind: "human" },
					session: { id: "s" },
				} as unknown as Session,
			}),
		});
	const visitor = () =>
		createRouterClient(appRouter, { context: testContext({ db }) });
	const a = () => as(adminA, "admin");
	const b = () => as(adminB, "super_admin");
	const text = (marker: string) => `# Title\n\nSecret draft ${marker} ${run}`;
	let orgId = "";

	/** Saves a draft (first save, or over the current one) and returns its version. */
	const draftOf = async (
		document: "terms" | "privacy" | "notice" | "organization_terms",
		language: "fr" | "en",
		content: string,
	) => {
		const current = await a().admin.legal.draft({ document, language });
		return a().admin.legal.saveDraft({
			document,
			language,
			content,
			expectedVersion: current.version,
		});
	};

	beforeAll(async () => {
		await db.insert(user).values([
			{ id: adminA, name: "Admin A", email: `${adminA}@x.org`, role: "admin" },
			{
				id: adminB,
				name: "Admin B",
				email: `${adminB}@x.org`,
				role: "super_admin",
			},
			{
				id: moderator,
				name: "Moderator",
				email: `${moderator}@x.org`,
				role: "moderator",
			},
			{
				id: member,
				name: "Member",
				email: `${member}@x.org`,
			},
			{ id: owner, name: "Owner", email: `${owner}@x.org` },
		]);
		const [org] = await db
			.insert(organization)
			.values({
				slug: `legal-org-${run}`,
				name: `Org ${run}`,
				ownerId: owner,
				website: `https://www.${run}.example.org`,
				country: "SN",
				contactEmail: `contact@${run}.example.org`,
				status: "validated",
				validatedAt: new Date(),
			})
			.returning({ id: organization.id });
		orgId = org?.id ?? "";
	});

	afterAll(async () => {
		await db
			.delete(organizationTermsAcceptance)
			.where(eq(organizationTermsAcceptance.organizationId, orgId));
		await db.delete(organization).where(eq(organization.id, orgId));
		await db
			.delete(legalDocumentVersion)
			.where(inArray(legalDocumentVersion.publishedBy, ids));
		await db
			.delete(legalDocumentDraft)
			.where(inArray(legalDocumentDraft.updatedBy, ids));
		await db.delete(auditLog).where(inArray(auditLog.actorId, ids));
		await db.delete(user).where(inArray(user.id, ids));
	});

	test("a Moderator, a Member and a visitor have no access to the editor", async () => {
		const key = { document: "terms", language: "fr" } as const;
		for (const client of [as(moderator, "moderator"), as(member, "member")]) {
			await expect(client.admin.legal.list({})).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
			await expect(client.admin.legal.draft(key)).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
			await expect(
				client.admin.legal.saveDraft({
					...key,
					content: "x",
					expectedVersion: 0,
				}),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			await expect(
				client.admin.legal.publish({
					...key,
					expectedVersion: 1,
					reason: "No right",
				}),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			await expect(client.admin.legal.history(key)).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
		}
		await expect(visitor().admin.legal.list({})).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	test("a draft is shared, never public, and two Admins meet a version conflict", async () => {
		const key = { document: "notice", language: "en" } as const;
		const before = await a().admin.legal.draft(key);
		expect(before).toMatchObject({ content: null, version: 0 });

		const first = await a().admin.legal.saveDraft({
			...key,
			content: text("one"),
			expectedVersion: 0,
		});
		expect(first).toMatchObject({ version: 1, updatedByName: "Admin A" });
		// Admin B also opened the document with no draft: the second to save is refused.
		await expect(
			b().admin.legal.saveDraft({
				...key,
				content: text("two"),
				expectedVersion: 0,
			}),
		).rejects.toMatchObject({ code: "CONFLICT", data: { version: 1 } });
		// Once B has read the draft, B saves over it.
		const second = await b().admin.legal.saveDraft({
			...key,
			content: text("two"),
			expectedVersion: 1,
		});
		expect(second.version).toBe(2);
		// A stale save of A is refused too.
		await expect(
			a().admin.legal.saveDraft({
				...key,
				content: text("three"),
				expectedVersion: 1,
			}),
		).rejects.toMatchObject({ code: "CONFLICT", data: { version: 2 } });

		// Nothing is public until it is published.
		expect(await visitor().legal.get(key)).toBeNull();
	});

	test("a publication needs a reason, keeps it away from the public and is audited without the text", async () => {
		const key = { document: "notice", language: "fr" } as const;
		const draft = await draftOf("notice", "fr", text("notice"));
		await expect(
			a().admin.legal.publish({
				...key,
				expectedVersion: draft.version,
				reason: "ab",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		// Someone saved meanwhile: the publication of the old draft is refused.
		await expect(
			a().admin.legal.publish({
				...key,
				expectedVersion: draft.version + 1,
				reason: "Fix the address",
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });

		const published = await a().admin.legal.publish({
			...key,
			expectedVersion: draft.version,
			reason: "Fix the address",
		});
		expect(published).toMatchObject({
			version: 1,
			reason: "Fix the address",
			important: false,
			publishedByName: "Admin A",
		});

		const pub = await visitor().legal.get(key);
		expect(pub?.version).toBe(1);
		expect(pub?.html).toContain("Secret draft notice");
		expect(JSON.stringify(pub)).not.toContain("Fix the address");
		// The other language is untouched.
		expect(await visitor().legal.get({ ...key, language: "en" })).toBeNull();

		const [event] = await db
			.select({ details: auditLog.details, targetId: auditLog.targetId })
			.from(auditLog)
			.where(
				and(eq(auditLog.actorId, adminA), eq(auditLog.action, "legal.publish")),
			);
		expect(event?.details).toEqual({
			document: "notice",
			language: "fr",
			reason: "Fix the address",
		});
		expect(JSON.stringify(event)).not.toContain("Secret draft");

		// A second publication is version 2; the first is kept and readable.
		const next = await draftOf("notice", "fr", text("notice v2"));
		await a().admin.legal.publish({
			...key,
			expectedVersion: next.version,
			reason: "Second round",
		});
		const { items } = await a().admin.legal.history(key);
		expect(items.map((v) => v.version)).toEqual([2, 1]);
		const old = await a().admin.legal.version({ ...key, version: 1 });
		expect(old.content).toContain("Secret draft notice");
		await expect(
			a().admin.legal.version({ ...key, version: 9 }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("publishing nothing is refused", async () => {
		await expect(
			a().admin.legal.publish({
				document: "contact",
				language: "en",
				expectedVersion: 1,
				reason: "There is no draft",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("an important change of the terms asks the Members again, a plain one does not", async () => {
		const { consent: start } = await visitor().legal.versions({});
		await db
			.update(user)
			.set({ consentVersion: start })
			.where(eq(user.id, member));
		expect(await as(member, "member").members.consent({})).toEqual({
			required: false,
			current: start,
		});

		// The legal notice has no such box.
		const notice = await draftOf("notice", "en", text("n"));
		await expect(
			a().admin.legal.publish({
				document: "notice",
				language: "en",
				expectedVersion: notice.version,
				reason: "Not a consent text",
				important: true,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		const terms = await draftOf("terms", "fr", text("terms"));
		await a().admin.legal.publish({
			document: "terms",
			language: "fr",
			expectedVersion: terms.version,
			reason: "Typo",
		});
		expect((await visitor().legal.versions({})).consent).toBe(start);

		const privacy = await draftOf("privacy", "en", text("privacy"));
		await a().admin.legal.publish({
			document: "privacy",
			language: "en",
			expectedVersion: privacy.version,
			reason: "New processor",
			important: true,
		});
		const raised = String(Number(start) + 1);
		expect((await visitor().legal.versions({})).consent).toBe(raised);

		// The next page view of a signed-in Member: blocked until they accept the new version.
		expect(await as(member, "member").members.consent({})).toEqual({
			required: true,
			current: raised,
		});
		await expect(
			as(member, "member").members.acceptConsent({ version: start }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await as(member, "member").members.acceptConsent({ version: raised });
		expect(await as(member, "member").members.consent({})).toEqual({
			required: false,
			current: raised,
		});
		const [row] = await db
			.select({ version: user.consentVersion, at: user.consentAcceptedAt })
			.from(user)
			.where(eq(user.id, member));
		expect(row?.version).toBe(raised);
		expect(row?.at).not.toBeNull();
	});

	test("a Member with no consent recorded is asked, and is not once they accept", async () => {
		await db
			.update(user)
			.set({ consentVersion: null, consentAcceptedAt: null })
			.where(eq(user.id, member));
		const { consent: current } = await visitor().legal.versions({});
		expect(await as(member, "member").members.consent({})).toEqual({
			required: true,
			current,
		});
		await as(member, "member").members.acceptConsent({ version: current });
		expect(await as(member, "member").members.consent({})).toEqual({
			required: false,
			current,
		});
	});

	test("the acceptances recorded before the editor count for version 1; an important change asks again", async () => {
		const terms = () =>
			as(owner, "member").organizations.hackathons.terms.get({
				organizationId: orgId,
			});
		const { organizationTerms: start } = await visitor().legal.versions({});
		// What the migration did to the acceptances of the text of the repository.
		await db.insert(organizationTermsAcceptance).values({
			organizationId: orgId,
			version: start,
			acceptedBy: owner,
		});
		expect(await terms()).toMatchObject({ version: start, accepted: true });

		// A correction: nobody accepts again.
		const draft = await draftOf("organization_terms", "fr", text("org"));
		const fix = await a().admin.legal.publish({
			document: "organization_terms",
			language: "fr",
			expectedVersion: draft.version,
			reason: "Typo",
		});
		expect(fix.important).toBe(false);
		expect(await terms()).toMatchObject({ version: start, accepted: true });

		// An important change: the Organization accepts the new version before its next publication.
		const next = await draftOf("organization_terms", "fr", text("org v2"));
		await a().admin.legal.publish({
			document: "organization_terms",
			language: "fr",
			expectedVersion: next.version,
			reason: "New prize rules",
			important: true,
		});
		const asked = await terms();
		expect(asked).toMatchObject({ accepted: false });
		expect(asked.version).toBe(String(Number(start) + 1));
		await expect(
			as(owner, "member").organizations.hackathons.terms.accept({
				organizationId: orgId,
				version: start,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(
			await as(owner, "member").organizations.hackathons.terms.accept({
				organizationId: orgId,
				version: asked.version,
			}),
		).toMatchObject({ accepted: true });
	});

	test("the overview lists every document in both languages", async () => {
		const { items } = await a().admin.legal.list({});
		expect(items).toHaveLength(10);
		const notice = items.find(
			(i) => i.document === "notice" && i.language === "fr",
		);
		expect(notice?.published?.version).toBe(2);
		expect(notice?.draftVersion).toBeGreaterThan(0);
	});
});
