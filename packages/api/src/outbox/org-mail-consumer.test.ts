/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { Database } from "@codesphere/db";

import { orgMailConsumer } from "./org-mail-consumer";

const message = {
	id: "00000000-0000-4000-8000-000000000001",
	type: "organization.suspended",
	aggregateType: "organization",
	aggregateId: "00000000-0000-4000-8000-000000000002",
	payload: {},
	createdAt: new Date().toISOString(),
};

describe("orgMailConsumer", () => {
	test("wants the three events of the Organization space", () => {
		expect(orgMailConsumer().types).toEqual([
			"organization.invited",
			"hackathon.unpublished",
			"organization.suspended",
		]);
	});

	test("without an email service it logs and handles the event without reading anything", async () => {
		const lines: string[] = [];
		const consumer = orgMailConsumer({ log: (line) => lines.push(line) });
		// A database that fails on any use proves nothing was read.
		const db = new Proxy({} as Database, {
			get: () => () => {
				throw new Error("the database must not be used");
			},
		});
		await consumer.handle(message, db);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain(message.id);
	});
});
