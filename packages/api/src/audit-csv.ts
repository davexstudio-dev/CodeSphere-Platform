// CSV of the audit journal (#287). One line per event, newest first, in the order the API returns
// them. Written for a spreadsheet: a cell that starts with = + - @ (or a tab or a return) is
// prefixed with an apostrophe so Excel and Sheets do not run it as a formula, and every cell is
// quoted when it holds a comma, a quote or a line break.

export type AuditCsvRow = {
	id: string;
	createdAt: string;
	actorId: string | null;
	action: string;
	targetType: string;
	targetId: string | null;
	details: {
		fields?: string[];
		reason?: string;
		from?: string;
		to?: string;
	} | null;
};

export const AUDIT_CSV_HEADER = [
	"id",
	"date",
	"actor_id",
	"action",
	"target_type",
	"target_id",
	"reason",
	"fields",
	"from",
	"to",
] as const;

const FORMULA = /^[=+\-@\t\r]/;

/** One cell, safe for a spreadsheet. */
export function csvCell(value: string | null | undefined): string {
	if (value === null || value === undefined || value === "") {
		return "";
	}
	const text = FORMULA.test(value) ? `'${value}` : value;
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The journal as CSV text: a header line, then one line per event, each ending in CRLF. */
export function auditCsv(rows: readonly AuditCsvRow[]): string {
	const lines = [
		AUDIT_CSV_HEADER.join(","),
		...rows.map((row) =>
			[
				row.id,
				row.createdAt,
				row.actorId,
				row.action,
				row.targetType,
				row.targetId,
				row.details?.reason,
				row.details?.fields?.join(" "),
				row.details?.from,
				row.details?.to,
			]
				.map(csvCell)
				.join(","),
		),
	];
	return `${lines.join("\r\n")}\r\n`;
}
