/// <reference types="bun" />
// Full-text search and near-duplicate detection on Postgres (#247).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import { questions } from "@codesphere/db/schema/questions";
import { createRouterClient } from "@orpc/server";
import { eq } from "drizzle-orm";

import { appRouter } from "../routers";
import { testContext } from "../test-context";
import {
	createPostgresSearchIndex,
	decodeSearchCursor,
	encodeSearchCursor,
} from "./service";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("search on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID();
	const author = `it-search-${run}`;
	const index = createPostgresSearchIndex(db);
	const api = createRouterClient(appRouter, {
		context: testContext({ db, session: null }),
	});
	const ids: Record<string, string> = {};

	const add = async (
		key: string,
		language: "fr" | "en",
		title: string,
		body: string,
		tags: string[] = ["sql"],
		deletedAt: Date | null = null,
	) => {
		const [row] = await db
			.insert(questions)
			.values({
				authorId: author,
				idempotencyKey: crypto.randomUUID(),
				title,
				body,
				bodyHtml: `<p>${body}</p>`,
				language,
				tags,
				deletedAt,
			})
			.returning({ id: questions.id });
		ids[key] = row?.id ?? "";
	};
	const id = (key: string) => {
		const found = ids[key];
		if (!found) throw new Error(`no question ${key}`);
		return found;
	};
	// Only this run's rows matter: other suites share the database.
	const mine = (found: string[]) =>
		found.filter((id) => Object.values(ids).includes(id));
	const keysOf = (found: string[]) =>
		mine(found).map((id) => Object.keys(ids).find((k) => ids[k] === id));

	beforeAll(async () => {
		await db
			.insert(user)
			.values({ id: author, name: author, email: `${author}@example.com` });
		await add(
			"fr-index",
			"fr",
			"Comment créer un index sur une colonne ?",
			"Je veux accélérer mes requêtes sur une grande table PostgreSQL.",
		);
		await add(
			"fr-body-only",
			"fr",
			"Lenteur inexpliquée",
			"Après réflexion, un index composite aide les jointures lentes.",
		);
		await add(
			"en-index",
			"en",
			"How do I create an index on a column?",
			"I want to speed up my queries on a large PostgreSQL table.",
		);
		await add(
			"en-database",
			"en",
			"Which database should I pick for a side project?",
			"Weighing SQLite against PostgreSQL.",
			["databases"],
		);
		await add(
			"fr-gone",
			"fr",
			"Comment créer un index supprimé ?",
			"Contenu retiré.",
			["sql"],
			new Date(),
		);
		await add("fr-tag", "fr", "Une question sans rapport", "Rien à voir.", [
			"gigaoctet",
		]);
	});

	afterAll(async () => {
		await db.delete(questions).where(eq(questions.authorId, author));
		await db.delete(user).where(eq(user.id, author));
	});

	const search = async (text: string, language?: "fr" | "en") =>
		mine(await index.search({ text, language, limit: 50, offset: 0 }));

	test("French: accents and word forms are forgiven", async () => {
		// "creer" has no accent, "requetes" no circumflex; "accelerer" matches "accélérer".
		expect(await search("creer index")).toContain(id("fr-index"));
		expect(await search("accelerer requetes")).toContain(id("fr-index"));
		// A plural / inflected form stems to the same root.
		expect(await search("indexes composites")).toContain(id("fr-body-only"));
	});

	test("English: word forms are forgiven", async () => {
		expect(await search("creating indexes")).toContain(id("en-index"));
		expect(await search("queries speeding")).toContain(id("en-index"));
	});

	test("a common typo in a title still finds it", async () => {
		expect(await search("colone")).toContain(id("fr-index"));
		expect(await search("databse")).toContain(id("en-database"));
	});

	test("a Tag is searchable", async () => {
		expect(await search("gigaoctet")).toContain(id("fr-tag"));
	});

	test("a title match outranks a body-only match", async () => {
		const found = keysOf(
			await index.search({ text: "index", limit: 50, offset: 0 }),
		);
		expect(found.indexOf("fr-index")).toBeLessThan(
			found.indexOf("fr-body-only"),
		);
	});

	test("the language filter and deleted Questions", async () => {
		expect(await search("index", "en")).toEqual([id("en-index")]);
		const all = await search("creer un index supprime");
		expect(all).not.toContain(id("fr-gone"));
	});

	test("under 3 characters matches nothing", async () => {
		expect(await index.search({ text: "ab", limit: 10, offset: 0 })).toEqual(
			[],
		);
	});

	test("never issues a cursor the decoder would refuse", async () => {
		expect(encodeSearchCursor(9999)).toBe("o9999");
		expect(encodeSearchCursor(10_000)).toBeNull();
		expect(decodeSearchCursor(encodeSearchCursor(9999) ?? undefined)).toBe(
			9999,
		);
		await expect(
			api.questions.search({ q: "ab", limit: 5 }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("questions.search returns items, paginates and refuses a cursor it did not issue", async () => {
		const first = await api.questions.search({ q: "index", limit: 1 });
		expect(first.items).toHaveLength(1);
		expect(first.nextCursor).toBe("o1");
		const second = await api.questions.search({
			q: "index",
			limit: 1,
			cursor: first.nextCursor ?? undefined,
		});
		expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
		await expect(
			api.questions.search({ q: "index", cursor: "bogus" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("similar titles are found while typing; short or unrelated titles are not", async () => {
		const close = await api.questions.similar({
			title: "comment creer un index sur la colonne",
		});
		expect(close.items.map((q) => q.id)).toContain(id("fr-index"));
		expect(close.items.length).toBeLessThanOrEqual(5);
		expect(
			(await api.questions.similar({ title: "recette de la tarte aux pommes" }))
				.items,
		).toEqual([]);
		expect((await api.questions.similar({ title: "index" })).items).toEqual([]);
	});
});
