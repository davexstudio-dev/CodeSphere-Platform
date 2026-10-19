import { describe, expect, test } from "bun:test";

import {
	ABANDON_AFTER,
	backoff,
	failed,
	failureOf,
	flush,
	newEntry,
	type OutboxAction,
	type OutboxEntry,
	waiting,
} from "./outbox";

const answer: OutboxAction = {
	kind: "answer.create",
	input: {
		idempotencyKey: "0191f0a0-0000-7000-8000-000000000001",
		questionId: "0191f0a0-0000-7000-8000-000000000002",
		body: "Use an index.",
	},
};

const networkError = new TypeError("Failed to fetch");

describe("failureOf", () => {
	test("a refusal is rejected, never retried", () => {
		for (const code of [
			"FORBIDDEN",
			"PRIVILEGE_REQUIRED",
			"NOT_FOUND",
			"CONFLICT",
			"BAD_REQUEST",
		] as const) {
			expect(failureOf({ code })).toEqual({ type: "reject", reason: code });
		}
	});

	test("a BAD_REQUEST names the field it refused", () => {
		expect(
			failureOf({
				code: "BAD_REQUEST",
				data: { issues: [{ path: ["tags"], message: "Tags must be 1–5" }] },
			}),
		).toEqual({ type: "reject", reason: "BAD_REQUEST", field: "tags" });
	});

	test("a 429 waits retryAfter seconds", () => {
		expect(
			failureOf({ code: "TOO_MANY_REQUESTS", data: { retryAfter: 42 } }),
		).toEqual({ type: "wait", ms: 42_000 });
	});

	test("a network error or a server failure is retried", () => {
		expect(failureOf(networkError)).toEqual({ type: "retry" });
		expect(failureOf({ code: "INTERNAL_SERVER_ERROR" })).toEqual({
			type: "retry",
		});
	});
});

describe("failed", () => {
	test("backs off on a network error", () => {
		const entry = failed(newEntry(answer, 0), networkError, 1000);
		expect(entry).toMatchObject({
			state: "pending",
			attempts: 1,
			notBefore: 1000 + backoff(1),
		});
	});

	test("keeps a CONFLICT as rejected with its reason", () => {
		expect(failed(newEntry(answer, 0), { code: "CONFLICT" }, 1)).toMatchObject({
			state: "rejected",
			reason: "CONFLICT",
		});
	});

	test("the backoff grows and is capped at 5 minutes", () => {
		expect(backoff(1)).toBe(2000);
		expect(backoff(2)).toBe(4000);
		expect(backoff(20)).toBe(300_000);
	});
});

describe("flush", () => {
	const options = (now: number, online = true) => ({
		now: () => now,
		online: () => online,
	});

	test("sends nothing while offline", async () => {
		const sent: OutboxAction[] = [];
		const out = await flush(
			[newEntry(answer, 0)],
			async (a) => sent.push(a),
			options(10, false),
		);
		expect(sent).toHaveLength(0);
		expect(waiting(out)).toHaveLength(1);
	});

	test("answer offline, network back: published exactly once", async () => {
		// The server, as the API behaves: a replayed idempotencyKey returns the first Answer.
		const published = new Map<string, { id: string }>();
		let network = false;
		const send = async (action: OutboxAction) => {
			if (!network) {
				throw networkError;
			}
			if (action.kind !== "answer.create") {
				throw new Error("unexpected");
			}
			const key = action.input.idempotencyKey;
			const existing = published.get(key) ?? { id: `a-${published.size + 1}` };
			published.set(key, existing);
			return existing;
		};

		let entries: OutboxEntry[] = [newEntry(answer, 0)];
		// A first try that cannot reach the server.
		entries = await flush(entries, send, options(1));
		expect(entries[0]).toMatchObject({ state: "pending", attempts: 1 });
		// The network is back; the outbox runs twice (a tab focus and the timer, say).
		network = true;
		entries = await flush(entries, send, options(60_000));
		entries = await flush(entries, send, options(120_000));
		expect(entries[0]).toMatchObject({ state: "sent", result: { id: "a-1" } });
		expect(published.size).toBe(1);
	});

	test("a lost response is replayed with the same key: still one Answer", async () => {
		const published = new Map<string, { id: string }>();
		let loseResponse = true;
		const send = async (action: OutboxAction) => {
			const key = (action as Extract<OutboxAction, { kind: "answer.create" }>)
				.input.idempotencyKey;
			const existing = published.get(key) ?? { id: `a-${published.size + 1}` };
			published.set(key, existing);
			if (loseResponse) {
				loseResponse = false;
				throw networkError;
			}
			return existing;
		};
		let entries = await flush([newEntry(answer, 0)], send, options(1));
		entries = await flush(entries, send, options(60_000));
		expect(entries[0]?.state).toBe("sent");
		expect(published.size).toBe(1);
	});

	test("a rejected entry is not sent again", async () => {
		let calls = 0;
		const send = async () => {
			calls++;
			throw { code: "CONFLICT" };
		};
		let entries = await flush([newEntry(answer, 0)], send, options(1));
		entries = await flush(entries, send, options(10 * 60_000));
		expect(calls).toBe(1);
		expect(entries[0]).toMatchObject({ state: "rejected", reason: "CONFLICT" });
	});

	test("a 429 is not retried before retryAfter", async () => {
		let calls = 0;
		const send = async () => {
			calls++;
			if (calls === 1) {
				throw { code: "TOO_MANY_REQUESTS", data: { retryAfter: 30 } };
			}
			return { ok: true };
		};
		let entries = await flush([newEntry(answer, 0)], send, options(0));
		entries = await flush(entries, send, options(29_000));
		expect(calls).toBe(1);
		entries = await flush(entries, send, options(30_000));
		expect(calls).toBe(2);
		expect(entries[0]?.state).toBe("sent");
	});

	test("an entry older than 30 days is abandoned unsent", async () => {
		let calls = 0;
		const out = await flush(
			[newEntry(answer, 0)],
			async () => {
				calls++;
			},
			options(ABANDON_AFTER + 1),
		);
		expect(calls).toBe(0);
		expect(out[0]?.state).toBe("abandoned");
	});

	test("reports « sending » while a send is in flight", async () => {
		const seen: string[] = [];
		await flush([newEntry(answer, 0)], async () => ({}), {
			...options(1),
			onChange: (entries) => seen.push(entries[0]?.state ?? ""),
		});
		expect(seen).toEqual(["sending", "sent"]);
	});
});
