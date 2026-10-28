import { describe, expect, test } from "bun:test";

import { firstInGroups } from "./default-selection";

describe("firstInGroups", () => {
	const items = [
		{ id: "a", group: "used" },
		{ id: "b", group: "protected" },
		{ id: "c", group: "used" },
	] as const;
	const groupOf = (item: (typeof items)[number]) => item.group;

	test("takes the first entry of the first non-empty group", () => {
		expect(firstInGroups(items, ["protected", "used"], groupOf)).toBe("b");
		expect(firstInGroups(items, ["unused", "used"], groupOf)).toBe("a");
	});

	test("is null for an empty list", () => {
		expect(firstInGroups([], ["used"], groupOf)).toBeNull();
	});
});
