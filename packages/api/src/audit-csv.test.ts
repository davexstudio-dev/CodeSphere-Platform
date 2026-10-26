/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { auditCsv, csvCell } from "./audit-csv";

const base = {
	id: "e1",
	createdAt: "2026-10-26T10:00:00.000Z",
	actorId: "admin-1",
	action: "member.suspend",
	targetType: "member",
	targetId: "m-1",
	details: null,
};

describe("csvCell", () => {
	test("leaves a plain value alone and empties null", () => {
		expect(csvCell("member.suspend")).toBe("member.suspend");
		expect(csvCell(null)).toBe("");
		expect(csvCell(undefined)).toBe("");
	});

	test("quotes a value with a comma, a quote or a line break", () => {
		expect(csvCell("a,b")).toBe('"a,b"');
		expect(csvCell('say "hi"')).toBe('"say ""hi"""');
		expect(csvCell("one\ntwo")).toBe('"one\ntwo"');
	});

	test("neutralises a formula", () => {
		for (const risky of ["=1+1", "+1", "-1", "@SUM(A1)", "\tcmd"]) {
			expect(csvCell(risky).replace(/^"/, "")).toStartWith("'");
		}
	});
});

describe("auditCsv", () => {
	test("a header, then one CRLF-ended line per event", () => {
		const csv = auditCsv([base, { ...base, id: "e2" }]);
		const lines = csv.split("\r\n");
		expect(lines[0]).toBe(
			"id,date,actor_id,action,target_type,target_id,reason,fields,from,to",
		);
		expect(lines[1]).toBe(
			"e1,2026-10-26T10:00:00.000Z,admin-1,member.suspend,member,m-1,,,,",
		);
		expect(lines).toHaveLength(4);
		expect(lines[3]).toBe("");
	});

	test("carries the reason, the fields and a role change", () => {
		const csv = auditCsv([
			{
				...base,
				action: "member.set_role",
				details: {
					reason: "Spam, répété",
					fields: ["role"],
					from: "moderator",
					to: "admin",
				},
			},
		]);
		expect(csv).toContain(',"Spam, répété",role,moderator,admin\r\n');
	});

	test("an event with no actor leaves the cell empty", () => {
		expect(auditCsv([{ ...base, actorId: null }])).toContain(
			"2026-10-26T10:00:00.000Z,,member.suspend",
		);
	});

	test("an empty journal is just the header", () => {
		expect(auditCsv([]).split("\r\n")).toHaveLength(2);
	});
});
