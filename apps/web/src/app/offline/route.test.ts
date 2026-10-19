/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { OFFLINE_URL } from "../../sw/routes";
import { GET } from "./route";

describe("the offline page", () => {
	test("is served as HTML at the URL the worker precaches, in both languages, with no script", async () => {
		expect(OFFLINE_URL).toBe("/offline");
		const response = GET();
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
		const html = await response.text();
		expect(html).toContain("Vous êtes hors ligne");
		expect(html).toContain("You are offline");
		expect(html).not.toContain("<script");
	});
});
