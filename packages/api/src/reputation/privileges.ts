import { PRIVILEGES, type PrivilegeName } from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import * as z from "zod";

import { reputationOf } from "./read";

export type PrivilegeThresholds = Record<PrivilegeName, number>;

// Decision #219: voting up, asking and answering need no Privilege; these do. Admins alone suspend.
export const DEFAULT_PRIVILEGE_THRESHOLDS: PrivilegeThresholds = {
	flag: 25,
	propose_tag_edit: 25,
	downvote: 75,
	close_vote: 150,
	edit_tags: 300,
};

const Overrides = z
	.object(
		Object.fromEntries(
			PRIVILEGES.map((name) => [name, z.number().int().min(0).max(1_000_000)]),
		) as Record<PrivilegeName, z.ZodNumber>,
	)
	.partial()
	.strict();

/**
 * The thresholds in force: the defaults, overridden by `PRIVILEGE_THRESHOLDS`, a JSON object such
 * as `{"downvote": 100}`. No code change to retune. A malformed value throws, so a typo stops the
 * deployment instead of silently leaving a power at its default.
 */
export function parsePrivilegeThresholds(
	raw: string | undefined,
): PrivilegeThresholds {
	if (!raw?.trim()) {
		return DEFAULT_PRIVILEGE_THRESHOLDS;
	}
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		throw new Error("PRIVILEGE_THRESHOLDS is not valid JSON");
	}
	const parsed = Overrides.safeParse(json);
	if (!parsed.success) {
		throw new Error(
			`PRIVILEGE_THRESHOLDS is invalid: ${parsed.error.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; ")}`,
		);
	}
	return { ...DEFAULT_PRIVILEGE_THRESHOLDS, ...parsed.data };
}

export class PrivilegeError extends Error {
	constructor(
		readonly privilege: PrivilegeName,
		readonly required: number,
		readonly current: number,
	) {
		super("PRIVILEGE_REQUIRED");
	}
}

/**
 * Throws a PrivilegeError unless the human Member's Reputation reaches the threshold. A threshold
 * of 0 opens the power to everyone without reading the journal.
 */
export async function requirePrivilege(
	db: Database,
	member: { id: string },
	privilege: PrivilegeName,
	thresholds: PrivilegeThresholds = DEFAULT_PRIVILEGE_THRESHOLDS,
) {
	const required = thresholds[privilege];
	if (required <= 0) {
		return;
	}
	const current = (await reputationOf(db, { ...member, kind: "human" })) ?? 0;
	if (current < required) {
		throw new PrivilegeError(privilege, required, current);
	}
}
