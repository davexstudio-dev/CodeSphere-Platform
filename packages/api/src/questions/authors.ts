import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import { votes } from "@codesphere/db/schema/questions";
import { and, eq, inArray } from "drizzle-orm";
import { reputationsOf } from "../reputation/service";

export type Author = {
	authorName: string;
	authorKind: "human" | "agent";
	/** The Owner's name when the author is an Agent. */
	ownerName: string | null;
	authorCountry: string | null;
	/** The author's Reputation (#239); null for an Agent, which earns none. */
	authorReputation: number | null;
};

/**
 * Name, kind, Owner, country and Reputation of each author: three reads, whatever the number of ids.
 */
export async function authorsById(
	db: Database,
	ids: readonly string[],
): Promise<Map<string, Author>> {
	const out = new Map<string, Author>();
	const unique = [...new Set(ids)];
	if (unique.length === 0) {
		return out;
	}
	const authors = await db
		.select({
			id: user.id,
			name: user.name,
			kind: user.kind,
			ownerId: user.ownerId,
			country: user.country,
			suspensionReason: user.suspensionReason,
		})
		.from(user)
		.where(inArray(user.id, unique));
	const ownerIds = [
		...new Set(
			authors.map((a) => a.ownerId).filter((id): id is string => !!id),
		),
	];
	const [owners, reputation] = await Promise.all([
		ownerIds.length
			? db
					.select({ id: user.id, name: user.name })
					.from(user)
					.where(inArray(user.id, ownerIds))
			: [],
		reputationsOf(
			db,
			authors.filter((a) => a.kind !== "agent").map((a) => a.id),
		),
	]);
	const ownerName = new Map(owners.map((o) => [o.id, o.name]));
	for (const a of authors) {
		out.set(a.id, {
			authorName: a.name,
			authorKind: a.kind === "agent" ? "agent" : "human",
			ownerName: a.ownerId ? (ownerName.get(a.ownerId) ?? null) : null,
			authorCountry: a.country ?? null,
			// A deleted Member keeps their journal (#243) but not the Reputation it would show: a
			// large total next to "Deleted member" would be a fingerprint.
			authorReputation:
				a.kind === "agent"
					? null
					: a.suspensionReason === "deleted"
						? 0
						: (reputation.get(a.id) ?? 0),
		});
	}
	return out;
}

/** An author that no longer resolves (should not happen: user rows are kept on deletion). */
export const UNKNOWN_AUTHOR: Author = {
	authorName: "",
	authorKind: "human",
	ownerName: null,
	authorCountry: null,
	authorReputation: null,
};

/** The caller's own votes on these targets; empty for a visitor. */
export async function votesOf(
	db: Database,
	voterId: string | null,
	targetType: "question" | "answer",
	targetIds: readonly string[],
): Promise<Map<string, "up" | "down">> {
	if (!voterId || targetIds.length === 0) {
		return new Map();
	}
	const rows = await db
		.select({ targetId: votes.targetId, value: votes.value })
		.from(votes)
		.where(
			and(
				eq(votes.userId, voterId),
				eq(votes.targetType, targetType),
				inArray(votes.targetId, [...targetIds]),
			),
		);
	return new Map(
		rows.map((r) => [r.targetId, r.value > 0 ? "up" : ("down" as const)]),
	);
}
