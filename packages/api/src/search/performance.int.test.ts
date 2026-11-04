/// <reference types="bun" />
// p95 of search and of duplicate detection on a 20 000-Question dataset stays under 300 ms (#247).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import { questions } from "@codesphere/db/schema/questions";
import { eq, sql } from "drizzle-orm";

import { createPostgresSearchIndex } from "./service";

const url = process.env.TEST_DATABASE_URL;
const ROWS = 20_000;
const BATCH = 1_000;
const BUDGET_MS = 300;

const FR =
	"base table index requête jointure colonne clé serveur donnée schéma transaction verrou lenteur optimiser vérifier déployer erreur connexion mémoire fichier".split(
		" ",
	);
const EN =
	"database table index query join column key server data schema transaction lock slowness optimise check deploy error connection memory file".split(
		" ",
	);

// A small deterministic generator: the dataset is the same on every run.
function lcg(seed: number) {
	let state = seed;
	return () => {
		state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
		return state / 4_294_967_296;
	};
}

const p95 = (values: number[]) =>
	[...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95) - 1] ?? 0;

describe.skipIf(!url)("search performance on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const author = `it-perf-${crypto.randomUUID()}`;
	const index = createPostgresSearchIndex(db);

	beforeAll(async () => {
		await db
			.insert(user)
			.values({ id: author, name: author, email: `${author}@example.com` });
		const random = lcg(247);
		const words = (list: string[], n: number) =>
			Array.from(
				{ length: n },
				() => list[Math.floor(random() * list.length)],
			).join(" ");
		for (let start = 0; start < ROWS; start += BATCH) {
			await db.insert(questions).values(
				Array.from({ length: BATCH }, (_, i) => {
					const fr = (start + i) % 2 === 0;
					const list = fr ? FR : EN;
					const title = words(list, 6);
					const body = words(list, 40);
					return {
						authorId: author,
						idempotencyKey: crypto.randomUUID(),
						title,
						body,
						bodyHtml: `<p>${body}</p>`,
						language: fr ? ("fr" as const) : ("en" as const),
						tags: ["perf"],
					};
				}),
			);
		}
		// Statistics for the planner, as autovacuum would have by then.
		await db.execute(sql`ANALYZE questions`);
	}, 120_000);

	afterAll(async () => {
		await db.delete(questions).where(eq(questions.authorId, author));
		await db.delete(user).where(eq(user.id, author));
	}, 60_000);

	async function timeAll(
		queries: string[],
		run: (q: string) => Promise<unknown>,
	) {
		// One warm-up call per query shape, then the measured calls.
		await run(queries[0] ?? "");
		const times: number[] = [];
		for (const q of queries) {
			const start = performance.now();
			await run(q);
			times.push(performance.now() - start);
		}
		return p95(times);
	}

	test(`search p95 is under ${BUDGET_MS} ms`, async () => {
		const random = lcg(7);
		const queries = Array.from({ length: 100 }, () => {
			const list = random() < 0.5 ? FR : EN;
			return [0, 1]
				.map(() => list[Math.floor(random() * list.length)])
				.join(" ");
		});
		const measured = await timeAll(queries, (text) =>
			index.search({ text, limit: 20, offset: 0 }),
		);
		console.log(`search p95: ${measured.toFixed(1)} ms over ${ROWS} Questions`);
		expect(measured).toBeLessThan(BUDGET_MS);
	}, 120_000);

	test(`duplicate detection p95 is under ${BUDGET_MS} ms`, async () => {
		const random = lcg(11);
		const queries = Array.from({ length: 100 }, () => {
			const list = random() < 0.5 ? FR : EN;
			return Array.from(
				{ length: 6 },
				() => list[Math.floor(random() * list.length)],
			).join(" ");
		});
		const measured = await timeAll(queries, (title) =>
			index.similarTitles({ title, limit: 5 }),
		);
		console.log(
			`similar p95: ${measured.toFixed(1)} ms over ${ROWS} Questions`,
		);
		expect(measured).toBeLessThan(BUDGET_MS);
	}, 120_000);
});
