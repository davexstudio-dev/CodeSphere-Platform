/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import {
	type PublishReport,
	SocialAuthError,
	type SocialPublisher,
	SocialSignInError,
} from "@codesphere/social";

import {
	publishShare,
	type ShareDeps,
	type ShareInput,
	type ShareTarget,
	type SocialPostRow,
	type SocialPostStore,
	shareKey,
} from "./admin-social";

const input: ShareInput = { type: "question", id: "q1", platform: "bluesky" };

function memoryStore(): SocialPostStore & { rows: Map<string, SocialPostRow> } {
	const rows = new Map<string, SocialPostRow>();
	return {
		rows,
		async claim({ key, input: i }) {
			if (rows.has(key)) return false;
			rows.set(key, {
				targetType: i.type,
				targetId: i.id,
				platform: i.platform,
				state: "pending",
				postUrl: null,
				message: null,
				retryable: false,
			});
			return true;
		},
		async find(key) {
			return rows.get(key) ?? null;
		},
		async reclaim(key) {
			const row = rows.get(key);
			if (row?.state !== "failed" || !row.retryable) return false;
			rows.set(key, {
				...row,
				state: "pending",
				retryable: false,
				message: null,
			});
			return true;
		},
		async finish(key, patch) {
			const row = rows.get(key);
			if (row) rows.set(key, { ...row, ...patch });
		},
	};
}

function publisherOf(
	respond: () => Promise<PublishReport[]>,
): SocialPublisher & { sent: number } {
	const p = {
		platforms: ["bluesky", "linkedin", "x"] as const,
		sent: 0,
		async publish() {
			p.sent += 1;
			return respond();
		},
	};
	return p;
}

const ok = (): ShareTarget => ({
	ok: true,
	title: "How to X?",
	path: "/questions/q1",
});

function deps(
	publisher: SocialPublisher | null,
	extra: Partial<Omit<ShareDeps, "store">> = {},
): ShareDeps & { store: ReturnType<typeof memoryStore> } {
	const store = memoryStore();
	return {
		store,
		publisher,
		siteUrl: "https://codesphere.test",
		loadTarget: async () => ok(),
		...extra,
	};
}

const published = async (): Promise<PublishReport[]> => [
	{ platform: "bluesky", state: "published", url: "https://bsky.app/p/1" },
];

describe("publishShare", () => {
	test("is unavailable without a publisher, a site URL or the platform", async () => {
		for (const d of [
			deps(null),
			deps(publisherOf(published), { siteUrl: undefined }),
		]) {
			const out = await publishShare(d, "a1", input);
			expect(out).toMatchObject({ ok: false, code: "UNAVAILABLE" });
		}
	});

	test("publishes, stores the outcome and posts the canonical link", async () => {
		let posted: unknown;
		const publisher: SocialPublisher = {
			platforms: ["bluesky"],
			async publish(post) {
				posted = post;
				return published();
			},
		};
		const d = deps(publisher);
		const out = await publishShare(d, "a1", input);
		expect(out).toMatchObject({
			ok: true,
			publication: { state: "published", postUrl: "https://bsky.app/p/1" },
		});
		expect(posted).toEqual({
			text: "How to X?",
			url: "https://codesphere.test/questions/q1",
			idempotencyKey: shareKey(input),
		});
		expect(d.store.rows.get(shareKey(input))?.state).toBe("published");
	});

	test("a second call on a published post does not touch the platform", async () => {
		const publisher = publisherOf(published);
		const d = deps(publisher);
		await publishShare(d, "a1", input);
		const again = await publishShare(d, "a2", input);
		expect(again).toMatchObject({
			ok: true,
			publication: { state: "published" },
		});
		expect(publisher.sent).toBe(1);
	});

	test("two concurrent calls send once", async () => {
		const publisher = publisherOf(async () => {
			await new Promise((r) => setTimeout(r, 5));
			return published();
		});
		const d = deps(publisher);
		const [a, b] = await Promise.all([
			publishShare(d, "a1", input),
			publishShare(d, "a2", input),
		]);
		expect(publisher.sent).toBe(1);
		expect([a.ok, b.ok].sort()).toEqual([false, true]);
	});

	test("an unexpected error leaves the post unknown and is never re-sent", async () => {
		const publisher = publisherOf(async () => {
			throw new Error("socket hang up");
		});
		const d = deps(publisher);
		const first = await publishShare(d, "a1", input);
		expect(first).toMatchObject({
			ok: true,
			publication: { state: "unknown", retryable: false },
		});
		const second = await publishShare(d, "a1", input);
		expect(second).toMatchObject({ ok: false, code: "CONFLICT" });
		expect(publisher.sent).toBe(1);
	});

	test("a sign-in failure is retryable and the retry goes through", async () => {
		let attempt = 0;
		const publisher = publisherOf(async () => {
			attempt += 1;
			if (attempt === 1) throw new SocialSignInError("refused");
			return published();
		});
		const d = deps(publisher);
		const first = await publishShare(d, "a1", input);
		expect(first).toMatchObject({
			ok: true,
			publication: { state: "failed", retryable: true },
		});
		const second = await publishShare(d, "a1", input);
		expect(second).toMatchObject({
			ok: true,
			publication: { state: "published" },
		});
		expect(publisher.sent).toBe(2);
	});

	test("an account to reconnect is a retryable failure that says so, never published (#266)", async () => {
		const publisher = publisherOf(async () => {
			throw new SocialAuthError(
				"reconnect-required",
				"The account must be connected again.",
			);
		});
		const d = deps(publisher);
		const outcome = await publishShare(d, "a1", input);
		expect(outcome).toMatchObject({
			ok: true,
			publication: {
				state: "failed",
				retryable: true,
				message: "The account must be connected again.",
			},
		});
	});

	test("a token the platform refused (401) is a failure that asks to connect again (#266)", async () => {
		const publisher = publisherOf(async () => [
			{
				platform: "bluesky",
				state: "failed",
				retryable: true,
				authFailure: true,
				message: "401",
			},
		]);
		const outcome = await publishShare(deps(publisher), "a1", input);
		expect(outcome).toMatchObject({
			ok: true,
			publication: {
				state: "failed",
				message: "The platform refused the account's token; connect it again.",
			},
		});
		expect(outcome.ok && outcome.publication.state).not.toBe("published");
	});

	test("a non-retryable failure is not claimed again", async () => {
		const publisher = publisherOf(async () => [
			{ platform: "bluesky", state: "failed", message: "rejected" },
		]);
		const d = deps(publisher);
		await publishShare(d, "a1", input);
		const again = await publishShare(d, "a1", input);
		expect(again).toMatchObject({ ok: false, code: "CONFLICT" });
		expect(publisher.sent).toBe(1);
	});

	test("refuses content that is missing or written by an Agent, before claiming", async () => {
		for (const [reason, code] of [
			["not-found", "NOT_FOUND"],
			["agent-content", "CONFLICT"],
		] as const) {
			const publisher = publisherOf(published);
			const d = deps(publisher, {
				loadTarget: async () => ({ ok: false, reason }),
			});
			expect(await publishShare(d, "a1", input)).toMatchObject({
				ok: false,
				code,
			});
			expect(publisher.sent).toBe(0);
			expect(d.store.rows.size).toBe(0);
		}
	});

	test("uses the Admin's sentence when given", async () => {
		let text = "";
		const publisher: SocialPublisher = {
			platforms: ["bluesky"],
			async publish(post) {
				text = post.text;
				return published();
			},
		};
		await publishShare(deps(publisher), "a1", { ...input, text: "Solved!" });
		expect(text).toBe("Solved!");
	});
});
