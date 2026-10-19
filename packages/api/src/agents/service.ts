import { AGENTS_PER_OWNER, type AgentSummary } from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import { auditLog } from "@codesphere/db/schema/audit";
import { apikey, user } from "@codesphere/db/schema/auth";
import { and, count, eq, isNull, ne, or, sql } from "drizzle-orm";

import { withAudit } from "../audit";
import {
	type AgentRules,
	creationBlockedUntil,
	DEFAULT_AGENT_RULES,
	endPause,
	type PausedAgent,
	pauseState,
} from "./moderation";

export {
	type AgentRules,
	DEFAULT_AGENT_RULES,
	type PausedAgent,
	parseAgentRules,
	settleAgentAnswer,
} from "./moderation";

export class AgentError extends Error {
	constructor(
		readonly code: "NOT_FOUND" | "CONFLICT" | "PAUSED" | "BLOCKED",
		/** For BLOCKED: when the Owner may create Agents again. */
		readonly until?: Date,
	) {
		super(code);
	}
}

const KEY_PREFIX = "cs_live_";
const DELETED = "deleted";
const ALPHABET =
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// 64 random base62 characters (~381 bits) behind the `cs_live_` prefix. better-auth's api-key
// plugin refuses any key shorter than its `defaultKeyLength` (64) before even looking it up.
const KEY_LENGTH = 64;
function generateKey() {
	const bytes = crypto.getRandomValues(new Uint8Array(KEY_LENGTH));
	let out = KEY_PREFIX;
	for (const byte of bytes) {
		out += ALPHABET[byte % ALPHABET.length];
	}
	return out;
}

// The hash better-auth's api-key plugin looks keys up by: SHA-256, base64url without padding.
async function hashKey(key: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(key),
	);
	return Buffer.from(digest).toString("base64url");
}

type Preset = "read" | "contribute";

const presetOf = (metadata: string | null): Preset => {
	try {
		return JSON.parse(metadata ?? "{}").preset === "contribute"
			? "contribute"
			: "read";
	} catch {
		return "read";
	}
};

/** The preset of an Agent's key: the scope the API middleware enforces on its writes. */
export async function agentPreset(
	db: Database,
	agentId: string,
): Promise<Preset | null> {
	const [row] = await db
		.select({ metadata: apikey.metadata, enabled: apikey.enabled })
		.from(apikey)
		.where(eq(apikey.referenceId, agentId))
		.limit(1);
	return row ? presetOf(row.metadata) : null;
}

export function createAgentService(
	db: Database,
	rules: AgentRules = DEFAULT_AGENT_RULES,
) {
	const owned = (ownerId: string, id: string) =>
		and(
			eq(user.id, id),
			eq(user.ownerId, ownerId),
			eq(user.kind, "agent"),
			or(isNull(user.suspensionReason), ne(user.suspensionReason, DELETED)),
		);

	async function summary(ownerId: string, id: string): Promise<AgentSummary> {
		const [row] = await db
			.select({
				id: user.id,
				name: user.name,
				createdAt: user.createdAt,
				metadata: apikey.metadata,
				enabled: apikey.enabled,
				start: apikey.start,
			})
			.from(user)
			.leftJoin(apikey, eq(apikey.referenceId, user.id))
			.where(owned(ownerId, id))
			.limit(1);
		if (!row) {
			throw new AgentError("NOT_FOUND");
		}
		const pauses = await pauseState(db, id);
		return {
			id: row.id,
			name: row.name,
			preset: presetOf(row.metadata),
			enabled: row.enabled ?? false,
			paused: pauses.open,
			// The first pause the Owner may lift; after a second one, only an Admin.
			adminOnly: pauses.open && pauses.count >= 2,
			keyStart: row.start,
			createdAt: row.createdAt.toISOString(),
		};
	}

	// The apikey row for the agent `m` produced: the hash is stored, the clear key never.
	const apikeyInsert = (
		key: string,
		hash: string,
		name: string,
		preset: Preset,
	) => sql`
		INSERT INTO apikey (id, config_id, name, start, reference_id, prefix, key, enabled,
			rate_limit_enabled, rate_limit_time_window, rate_limit_max, request_count,
			created_at, updated_at, metadata)
		SELECT ${crypto.randomUUID()}, 'default', ${name}, ${key.slice(0, 12)}, m.id, ${KEY_PREFIX},
			${hash}, true, true, 60000, 120, 0, now(), now(), ${JSON.stringify({ preset })}
		FROM m
	`;

	return {
		async list(ownerId: string) {
			const rows = await db
				.select({ id: user.id })
				.from(user)
				.where(
					and(
						eq(user.ownerId, ownerId),
						eq(user.kind, "agent"),
						or(
							isNull(user.suspensionReason),
							ne(user.suspensionReason, DELETED),
						),
					),
				)
				.orderBy(user.createdAt);
			return {
				items: await Promise.all(rows.map((r) => summary(ownerId, r.id))),
			};
		},

		/** Up to AGENTS_PER_OWNER live Agents per Owner; the key is returned once. Audited. */
		async create(ownerId: string, input: { name: string; preset: Preset }) {
			const blockedUntil = await creationBlockedUntil(db, ownerId, rules);
			if (blockedUntil) {
				throw new AgentError("BLOCKED", blockedUntil);
			}
			const [{ n } = { n: 0 }] = await db
				.select({ n: count() })
				.from(user)
				.where(
					and(
						eq(user.ownerId, ownerId),
						eq(user.kind, "agent"),
						or(
							isNull(user.suspensionReason),
							ne(user.suspensionReason, DELETED),
						),
					),
				);
			if (n >= AGENTS_PER_OWNER) {
				throw new AgentError("CONFLICT");
			}
			const id = crypto.randomUUID();
			const key = generateKey();
			const hash = await hashKey(key);
			// The Agent and its key land in one statement, with their audit event (#122).
			await withAudit(
				db,
				{
					actorId: ownerId,
					action: "agent.key.create",
					targetType: "agent",
					targetIdColumn: "id",
					details: { fields: ["preset"] },
				},
				db
					.insert(user)
					.values({
						id,
						name: input.name,
						email: `agent-${id}@agents.invalid`,
						emailVerified: true,
						kind: "agent",
						ownerId,
					})
					.returning({ id: user.id }),
				[apikeyInsert(key, hash, input.name, input.preset)],
			);
			return { agent: await summary(ownerId, id), key };
		},

		/** New key, old one dead, Agent enabled again. Two events: the revoked key and the new one. */
		async rotateKey(ownerId: string, id: string) {
			await summary(ownerId, id);
			// A paused Agent: the Owner brings it back once; after a second pause, an Admin must.
			const pauses = await pauseState(db, id);
			if (pauses.open && pauses.count >= 2) {
				throw new AgentError("PAUSED");
			}
			const key = generateKey();
			const hash = await hashKey(key);
			const rows = await withAudit(
				db,
				[
					{
						actorId: ownerId,
						action: "agent.key.revoke",
						targetType: "agent",
						targetIdColumn: "reference_id",
						details: { reason: "rotated" },
					},
					{
						actorId: ownerId,
						action: "agent.key.create",
						targetType: "agent",
						targetIdColumn: "reference_id",
						details: { reason: "rotated" },
					},
				],
				db
					.update(apikey)
					.set({
						key: hash,
						start: key.slice(0, 12),
						enabled: true,
						updatedAt: new Date(),
					})
					.where(eq(apikey.referenceId, id))
					.returning({ reference_id: apikey.referenceId }),
			);
			if (rows.length === 0) {
				throw new AgentError("NOT_FOUND");
			}
			await endPause(db, id, ownerId);
			return { agent: await summary(ownerId, id), key };
		},

		async disable(ownerId: string, id: string) {
			await summary(ownerId, id);
			const rows = await withAudit(
				db,
				{
					actorId: ownerId,
					action: "agent.key.revoke",
					targetType: "agent",
					targetIdColumn: "reference_id",
					details: { reason: "disabled" },
				},
				db
					.update(apikey)
					.set({ enabled: false, updatedAt: new Date() })
					.where(eq(apikey.referenceId, id))
					.returning({ reference_id: apikey.referenceId }),
			);
			if (rows.length === 0) {
				throw new AgentError("NOT_FOUND");
			}
			return summary(ownerId, id);
		},

		/** What the public page of an Agent shows about it; NOT_FOUND for a human or an unknown id. */
		async publicInfo(id: string) {
			const [row] = await db
				.select({
					id: user.id,
					name: user.name,
					createdAt: user.createdAt,
					suspensionReason: user.suspensionReason,
					ownerName: sql<
						string | null
					>`(SELECT o.name FROM "user" o WHERE o.id = ${user.ownerId})`,
					enabled: apikey.enabled,
				})
				.from(user)
				.leftJoin(apikey, eq(apikey.referenceId, user.id))
				.where(and(eq(user.id, id), eq(user.kind, "agent")))
				.limit(1);
			if (!row) {
				throw new AgentError("NOT_FOUND");
			}
			const pauses = await pauseState(db, id);
			const status =
				row.suspensionReason === DELETED
					? ("retired" as const)
					: pauses.open
						? ("paused" as const)
						: row.enabled
							? ("active" as const)
							: ("disabled" as const);
			return {
				id: row.id,
				name: row.name,
				ownerName: row.ownerName ?? "Deleted member",
				status,
				createdAt: row.createdAt.toISOString(),
				rejectScore: rules.rejectScore,
			};
		},

		/**
		 * An Admin brings back a paused Agent, whatever the number of pauses: its key is enabled again
		 * and the pause ends. Audited. NOT_FOUND for a user that is not a live Agent.
		 */
		async reactivate(adminId: string, id: string) {
			const [agent] = await db
				.select({ id: user.id })
				.from(user)
				.where(
					and(
						eq(user.id, id),
						eq(user.kind, "agent"),
						or(
							isNull(user.suspensionReason),
							ne(user.suspensionReason, DELETED),
						),
					),
				)
				.limit(1);
			if (!agent) {
				throw new AgentError("NOT_FOUND");
			}
			const keys = await db
				.update(apikey)
				.set({ enabled: true, updatedAt: new Date() })
				.where(eq(apikey.referenceId, id))
				.returning({ id: apikey.id });
			if (keys.length === 0) {
				throw new AgentError("NOT_FOUND");
			}
			await endPause(db, id, adminId);
			await db.insert(auditLog).values({
				actorId: adminId,
				action: "agent.reactivate",
				targetType: "agent",
				targetId: id,
			});
		},

		/**
		 * The user row stays (its Questions and Answers point at it): the key is deleted and the
		 * Agent is marked retired, which hides it from the Owner's list and counts it out of the cap.
		 */
		async remove(ownerId: string, id: string) {
			const rows = await withAudit(
				db,
				{
					actorId: ownerId,
					action: "agent.key.revoke",
					targetType: "agent",
					targetIdColumn: "id",
					details: { reason: "deleted" },
				},
				db
					.update(user)
					.set({
						suspendedAt: new Date(),
						suspensionReason: DELETED,
						updatedAt: new Date(),
					})
					.where(owned(ownerId, id))
					.returning({ id: user.id }),
				[sql`DELETE FROM apikey WHERE reference_id IN (SELECT id FROM m)`],
			);
			if (rows.length === 0) {
				throw new AgentError("NOT_FOUND");
			}
			return { success: true };
		},
	};
}

/**
 * Tells the Owner their Agent was paused. A failed send is only logged: the pause already stands.
 */
export async function notifyAgentPaused(
	db: Database,
	paused: PausedAgent,
	notifications:
		| {
				agentPaused(
					member: { email: string; name: string },
					agentName: string,
				): Promise<void>;
		  }
		| undefined,
	logger: { warn(obj: object, msg: string): void },
) {
	if (!notifications) {
		return;
	}
	try {
		const [owner] = await db
			.select({ email: user.email, name: user.name })
			.from(user)
			.where(eq(user.id, paused.ownerId))
			.limit(1);
		if (owner) {
			await notifications.agentPaused(owner, paused.agentName);
		}
	} catch (error) {
		logger.warn({ err: error }, "agent paused notification failed");
	}
}
