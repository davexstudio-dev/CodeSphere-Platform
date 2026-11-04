/// <reference types="bun" />
// Integration test against a real Postgres (#125); skipped without TEST_DATABASE_URL.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Session } from "@codesphere/auth";
import { createDb } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { user } from "@codesphere/db/schema/auth";
import { hackathon } from "@codesphere/db/schema/hackathons";
import { questions } from "@codesphere/db/schema/questions";
import { tag, tagFollows } from "@codesphere/db/schema/tags";
import { cadev2026 } from "@codesphere/db/seed/cadev";
import { seedHackathon } from "@codesphere/db/seed/seed";
import { createRouterClient } from "@orpc/server";
import { eq, inArray } from "drizzle-orm";

import { appRouter } from "./routers";
import { testContext } from "./test-context";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("admin.tags on Postgres (#125)", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID().slice(0, 8);
	const adminId = `it-tag-admin-${run}`;
	const name = (suffix: string) => `it-${run}-${suffix}`;
	const clientAs = (role: string) =>
		createRouterClient(appRouter, {
			context: testContext({
				db,
				session: {
					user: { id: adminId, role, kind: "human" },
					session: { id: "s1" },
				} as unknown as Session,
			}),
		});
	const admin = () => clientAs("admin");

	beforeAll(async () => {
		await db.insert(user).values({
			id: adminId,
			name: "IT admin",
			email: `${adminId}@example.com`,
			role: "admin",
		});
	});

	afterAll(async () => {
		await db.delete(questions).where(eq(questions.authorId, adminId));
		await db.delete(auditLog).where(eq(auditLog.actorId, adminId));
		await db
			.delete(tag)
			.where(inArray(tag.name, [name("a"), name("b"), name("c"), name("r")]));
		await db.delete(user).where(eq(user.id, adminId));
	});

	test("`JavaScript ` and `javascript` give the same Tag", async () => {
		const created = await admin().admin.tags.create({ name: ` ${name("A")} ` });
		expect(created.name).toBe(name("a"));
		await expect(
			admin().admin.tags.create({ name: name("a") }),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	test("rename collides with another Tag's normalized name", async () => {
		const a = (await admin().admin.tags.list({})).items.find(
			(t) => t.name === name("a"),
		);
		const b = await admin().admin.tags.create({ name: name("b") });
		await expect(
			admin().admin.tags.rename({
				id: b.id,
				name: name("A"),
				expectedVersion: b.version,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		const renamed = await admin().admin.tags.rename({
			id: b.id,
			name: name("c"),
			expectedVersion: b.version,
		});
		expect(renamed).toMatchObject({ name: name("c"), version: 2 });
		expect(a).toBeDefined();
	});

	test("a Tag used by a Question cannot be deleted", async () => {
		const used = (await admin().admin.tags.list({})).items.find(
			(t) => t.name === name("a"),
		);
		await db.insert(questions).values({
			authorId: adminId,
			idempotencyKey: crypto.randomUUID(),
			title: "t",
			body: "b",
			bodyHtml: "<p>b</p>",
			language: "fr",
			tags: [name("a")],
		});
		await expect(
			admin().admin.tags.delete({ id: used?.id ?? "" }),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	test("renaming a used Tag moves its Questions with it", async () => {
		const t = await admin().admin.tags.create({ name: name("d") });
		const [q] = await db
			.insert(questions)
			.values({
				authorId: adminId,
				idempotencyKey: crypto.randomUUID(),
				title: "t",
				body: "b",
				bodyHtml: "<p>b</p>",
				language: "fr",
				tags: [name("d")],
			})
			.returning({ id: questions.id });
		const renamed = await admin().admin.tags.rename({
			id: t.id,
			name: name("e"),
			expectedVersion: t.version,
		});
		expect(renamed.questionCount).toBe(1);
		const [after] = await db
			.select({ tags: questions.tags })
			.from(questions)
			.where(eq(questions.id, q?.id ?? ""));
		expect(after?.tags).toEqual([name("e")]);
		await db.delete(tag).where(eq(tag.id, t.id));
	});

	test("renaming a Tag moves its followers, without doubling a follow", async () => {
		const from = await admin().admin.tags.create({ name: name("f") });
		// The admin follows the old name AND already follows the target name (a stale follow:
		// follows carry no foreign key to the Tag, so the target row can exist without a Tag).
		await db.insert(tagFollows).values([
			{ userId: adminId, tag: from.name },
			{ userId: adminId, tag: name("h") },
		]);
		await admin().admin.tags.rename({
			id: from.id,
			name: name("h"),
			expectedVersion: from.version,
		});
		const mine = await db
			.select({ tag: tagFollows.tag })
			.from(tagFollows)
			.where(eq(tagFollows.userId, adminId));
		expect(mine.map((row) => row.tag)).toEqual([name("h")]);
		await db.delete(tagFollows).where(eq(tagFollows.userId, adminId));
		await db.delete(tag).where(inArray(tag.name, [name("h"), name("f")]));
	});

	test("the Hackathon's Tag is protected, a non-admin is FORBIDDEN", async () => {
		// A Tag named like a Hackathon's slug belongs to it: own copy, the shared seed stays untouched.
		const slug = name("hack");
		await seedHackathon(db, { ...cadev2026, slug });
		const owned = await admin().admin.tags.create({ name: slug });
		expect(owned.ownerHackathon).toBe(slug);
		await expect(
			admin().admin.tags.delete({ id: owned.id }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await expect(
			admin().admin.tags.rename({
				id: owned.id,
				name: name("x"),
				expectedVersion: owned.version,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await db.delete(hackathon).where(eq(hackathon.slug, slug));
		await db.delete(tag).where(eq(tag.id, owned.id));
		await expect(clientAs("member").admin.tags.list({})).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	test("a reserved Tag can be neither renamed nor deleted", async () => {
		const reserved = await db
			.select({ id: tag.id, version: tag.version })
			.from(tag)
			.where(eq(tag.name, "roadmap"))
			.then((rows) => rows[0]);
		if (!reserved) {
			throw new Error("the roadmap Tag is not seeded");
		}
		await expect(
			admin().admin.tags.delete({ id: reserved.id }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await expect(
			admin().admin.tags.rename({
				id: reserved.id,
				name: name("x"),
				expectedVersion: reserved.version,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	test("an Admin reserves a Tag, which is then kept; lifting it is audited and versioned", async () => {
		const created = await admin().admin.tags.create({
			name: name("r"),
			reserved: true,
		});
		expect(created).toMatchObject({ reserved: true, system: false });
		await expect(
			admin().admin.tags.delete({ id: created.id }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await expect(
			admin().admin.tags.rename({
				id: created.id,
				name: name("x"),
				expectedVersion: created.version,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });

		const lifted = await admin().admin.tags.setReserved({
			id: created.id,
			reserved: false,
			expectedVersion: created.version,
		});
		expect(lifted).toMatchObject({
			reserved: false,
			version: created.version + 1,
		});
		// A stale screen cannot overwrite the newer state.
		await expect(
			admin().admin.tags.setReserved({
				id: created.id,
				reserved: true,
				expectedVersion: created.version,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		const again = await admin().admin.tags.setReserved({
			id: created.id,
			reserved: true,
			expectedVersion: lifted.version,
		});
		expect(again.reserved).toBe(true);

		const events = await db
			.select({ action: auditLog.action })
			.from(auditLog)
			.where(eq(auditLog.targetId, created.id));
		expect(events.map((e) => e.action).sort()).toEqual([
			"tag.create",
			"tag.reserve",
			"tag.unreserve",
		]);
		await admin().admin.tags.setReserved({
			id: created.id,
			reserved: false,
			expectedVersion: again.version,
		});
		await admin().admin.tags.delete({ id: created.id });
	});

	test("a system Tag stays reserved, and only staff may reserve", async () => {
		const roadmap = await db
			.select({ id: tag.id, version: tag.version })
			.from(tag)
			.where(eq(tag.name, "roadmap"))
			.then((rows) => rows[0]);
		if (!roadmap) throw new Error("the roadmap Tag is not seeded");
		await expect(
			admin().admin.tags.setReserved({
				id: roadmap.id,
				reserved: false,
				expectedVersion: roadmap.version,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await expect(
			clientAs("member").admin.tags.setReserved({
				id: roadmap.id,
				reserved: true,
				expectedVersion: roadmap.version,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		const listed = await admin().admin.tags.list({});
		expect(listed.items.find((t) => t.name === "roadmap")).toMatchObject({
			reserved: true,
			system: true,
		});
	});

	test("reserving is idempotent and refuses a Hackathon's Tag", async () => {
		const tagRow = await admin().admin.tags.create({
			name: name("b"),
			reserved: true,
		});
		const same = await admin().admin.tags.setReserved({
			id: tagRow.id,
			reserved: true,
			expectedVersion: tagRow.version,
		});
		expect(same.version).toBe(tagRow.version);
		const events = await db
			.select({ action: auditLog.action })
			.from(auditLog)
			.where(eq(auditLog.targetId, tagRow.id));
		expect(events.map((e) => e.action)).toEqual(["tag.create"]);

		const slug = name("hackres");
		await seedHackathon(db, { ...cadev2026, slug });
		const owned = await admin().admin.tags.create({ name: slug });
		await expect(
			admin().admin.tags.setReserved({
				id: owned.id,
				reserved: true,
				expectedVersion: owned.version,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await db.delete(hackathon).where(eq(hackathon.slug, slug));
		await db.delete(tag).where(inArray(tag.id, [owned.id, tagRow.id]));
	});

	test("reserving is idempotent and refuses a Hackathon's Tag", async () => {
		const row = await admin().admin.tags.create({
			name: name("b2"),
			reserved: true,
		});
		const same = await admin().admin.tags.setReserved({
			id: row.id,
			reserved: true,
			expectedVersion: row.version,
		});
		expect(same.version).toBe(row.version);
		const events = await db
			.select({ action: auditLog.action })
			.from(auditLog)
			.where(eq(auditLog.targetId, row.id));
		expect(events.map((e) => e.action)).toEqual(["tag.create"]);

		const slug = name("hackres");
		await seedHackathon(db, { ...cadev2026, slug });
		const owned = await admin().admin.tags.create({ name: slug });
		await expect(
			admin().admin.tags.setReserved({
				id: owned.id,
				reserved: true,
				expectedVersion: owned.version,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await db.delete(hackathon).where(eq(hackathon.slug, slug));
		await db.delete(tag).where(inArray(tag.id, [owned.id, row.id]));
	});
});
