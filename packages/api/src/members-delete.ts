import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import { eq, sql } from "drizzle-orm";

import { withAudit } from "./audit";

/**
 * Account deletion (spec §2, #52): the Member is anonymised in place, because their content points
 * at the user row. One statement, with the `member.delete` audit event: the row is rewritten, the
 * sessions and linked accounts go, the Agents are retired with their keys, and with `deleteContent`
 * the Member's Questions and Answers are soft-deleted, except an Answer accepted on another
 * Member's Question.
 *
 * Votes and the Reputation journal are kept (#243, decision #219): a Score is the sum of the votes
 * on a target and Reputation the sum of the journal, so deleting rows would silently change other
 * Members' numbers (and the next vote's recount). They point at the anonymised row, which holds no
 * name, email or location any more, and no public surface lists a voter.
 */
export async function deleteMember(
	db: Database,
	memberId: string,
	deleteContent: boolean,
) {
	const mine = sql`SELECT id FROM m`;
	const steps = [
		sql`DELETE FROM session WHERE user_id IN (${mine})`,
		sql`DELETE FROM account WHERE user_id IN (${mine})`,
		sql`DELETE FROM apikey WHERE reference_id IN (${mine})
			OR reference_id IN (SELECT id FROM "user" WHERE owner_id IN (${mine}))`,
		sql`UPDATE "user" SET suspended_at = now(), suspension_reason = 'deleted', updated_at = now()
			WHERE owner_id IN (${mine}) AND kind = 'agent'`,
		...(deleteContent
			? [
					sql`UPDATE answers SET deleted_at = now()
						WHERE author_id IN (${mine}) AND deleted_at IS NULL
						AND id NOT IN (
							SELECT q.accepted_answer_id FROM questions q
							WHERE q.accepted_answer_id IS NOT NULL
							AND q.author_id NOT IN (${mine})
						)`,
					sql`UPDATE questions SET deleted_at = now()
						WHERE author_id IN (${mine}) AND deleted_at IS NULL`,
				]
			: []),
	];
	const rows = await withAudit(
		db,
		{
			actorId: memberId,
			action: "member.delete",
			targetType: "member",
			targetIdColumn: "id",
			details: { fields: deleteContent ? ["content"] : [] },
		},
		db
			.update(user)
			.set({
				name: "Deleted member",
				email: `deleted-${memberId}@deleted.invalid`,
				emailVerified: false,
				image: null,
				country: null,
				city: null,
				cityPublic: false,
				suspendedAt: new Date(),
				suspensionReason: "deleted",
				updatedAt: new Date(),
			})
			.where(eq(user.id, memberId))
			.returning({ id: user.id }),
		steps,
	);
	return rows.length > 0;
}
