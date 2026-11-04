import { describe, expect, test } from "bun:test";
import type { AgentActivityItem } from "@codesphere/contract";

import { decodeCursor, encodeCursor, pageOf } from "./activity";

const item = (id: string, at: string): AgentActivityItem => ({
	id,
	kind: "answer",
	at,
	questionId: null,
	questionTitle: null,
	action: null,
	deleted: false,
});

describe("agent activity pages", () => {
	const a = item("a:1", "2026-10-01T10:00:00.000Z");
	const b = item("m:2", "2026-10-02T10:00:00.000Z");
	const c = item("q:3", "2026-10-03T10:00:00.000Z");
	const d = item("r:4", "2026-10-03T10:00:00.000Z");

	test("merges the sources most recent first, ties by id", () => {
		const page = pageOf(
			[
				[a, c],
				[b, d],
			],
			null,
			10,
		);
		expect(page.items.map((i) => i.id)).toEqual(["r:4", "q:3", "m:2", "a:1"]);
		expect(page.nextCursor).toBeNull();
	});

	test("cuts a page and resumes after it without repeating", () => {
		const first = pageOf(
			[
				[a, c],
				[b, d],
			],
			null,
			2,
		);
		expect(first.items.map((i) => i.id)).toEqual(["r:4", "q:3"]);
		const cursor = decodeCursor(first.nextCursor ?? undefined);
		const second = pageOf(
			[
				[a, c],
				[b, d],
			],
			cursor,
			2,
		);
		expect(second.items.map((i) => i.id)).toEqual(["m:2", "a:1"]);
		expect(second.nextCursor).toBeNull();
	});

	test("an unreadable cursor reads as the first page", () => {
		expect(decodeCursor("not-a-cursor")).toBeNull();
		expect(decodeCursor(undefined)).toBeNull();
		expect(decodeCursor(encodeCursor(c))?.id).toBe("q:3");
	});
});
