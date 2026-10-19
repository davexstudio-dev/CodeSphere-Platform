// The outbox of the local-first model (spec §3, #74): writes made offline wait on the device and
// are sent when the network returns. Pure logic only, so it is tested without a browser; the
// storage and the React glue live in `local-store.ts` and `components/outbox-provider.tsx`.
//
// States: pending → sending → sent | rejected (with its reason) | abandoned (after 30 days).
// A network failure retries with a growing delay, a 429 waits for `retryAfter`, and a refusal
// (FORBIDDEN, PRIVILEGE_REQUIRED, NOT_FOUND, CONFLICT, BAD_REQUEST) is never retried: the Member corrects it.

import type {
	CreateAnswerInput,
	CreateQuestionInput,
} from "@codesphere/contract";

type VoteTarget = { targetType: "question" | "answer"; targetId: string };

export type OutboxAction =
	| { kind: "question.create"; input: CreateQuestionInput }
	| { kind: "answer.create"; input: CreateAnswerInput }
	| { kind: "vote.cast"; input: VoteTarget & { value: "up" | "down" } }
	| { kind: "vote.retract"; input: VoteTarget }
	| { kind: "tag.follow"; input: { tag: string } }
	| { kind: "answer.accept"; input: { id: string } };

export type OutboxState =
	| "pending"
	| "sending"
	| "sent"
	| "rejected"
	| "abandoned";

/** Refusals worth showing the Member; anything else is retried. */
export type RejectionCode =
	| "FORBIDDEN"
	| "PRIVILEGE_REQUIRED"
	| "NOT_FOUND"
	| "CONFLICT"
	| "BAD_REQUEST";

export type OutboxEntry = {
	id: string;
	action: OutboxAction;
	state: OutboxState;
	/** Failed sends so far, for the backoff. */
	attempts: number;
	/** Epoch ms before which the entry is not sent again. */
	notBefore: number;
	createdAt: number;
	reason?: RejectionCode;
	/** The first field a BAD_REQUEST named, so the form can point at it. */
	field?: string;
	/** What the server answered, once sent (the created Question, the new Score…). */
	result?: unknown;
};

const SECOND = 1000;
const DAY = 24 * 60 * 60 * SECOND;
export const ABANDON_AFTER = 30 * DAY;
const MAX_BACKOFF = 5 * 60 * SECOND;

const REJECTED: readonly RejectionCode[] = [
	"FORBIDDEN",
	"PRIVILEGE_REQUIRED",
	"NOT_FOUND",
	"CONFLICT",
	"BAD_REQUEST",
];

export function newEntry(action: OutboxAction, now: number): OutboxEntry {
	return {
		id: crypto.randomUUID(),
		action,
		state: "pending",
		attempts: 0,
		notBefore: now,
		createdAt: now,
	};
}

/** 2 s, 4 s, 8 s… up to 5 minutes. */
export function backoff(attempts: number): number {
	return Math.min(MAX_BACKOFF, 2 ** attempts * SECOND);
}

type Failure =
	| { type: "reject"; reason: RejectionCode; field?: string }
	| { type: "wait"; ms: number }
	| { type: "retry" };

/** How a failed send is handled, from the oRPC error (a network error has no code). */
export function failureOf(error: unknown): Failure {
	const { code, data } = (error ?? {}) as {
		code?: unknown;
		data?: { retryAfter?: unknown; issues?: { path?: unknown[] }[] };
	};
	const rejected = REJECTED.find((c) => c === code);
	if (rejected) {
		const field = data?.issues?.[0]?.path?.[0];
		return typeof field === "string"
			? { type: "reject", reason: rejected, field }
			: { type: "reject", reason: rejected };
	}
	if (code === "TOO_MANY_REQUESTS") {
		const seconds = typeof data?.retryAfter === "number" ? data.retryAfter : 60;
		return { type: "wait", ms: Math.max(1, seconds) * SECOND };
	}
	return { type: "retry" };
}

/** The entry after a send that succeeded. */
export function succeeded(entry: OutboxEntry, result: unknown): OutboxEntry {
	return { ...entry, state: "sent", result, reason: undefined };
}

/** The entry after a send that failed with `error` at `now`. */
export function failed(
	entry: OutboxEntry,
	error: unknown,
	now: number,
): OutboxEntry {
	const failure = failureOf(error);
	if (failure.type === "reject") {
		return {
			...entry,
			state: "rejected",
			reason: failure.reason,
			field: failure.field,
		};
	}
	const attempts = entry.attempts + 1;
	return {
		...entry,
		state: "pending",
		attempts,
		notBefore: now + (failure.type === "wait" ? failure.ms : backoff(attempts)),
	};
}

/** Entries waiting for the network: pending (not yet due included) or being sent. */
export function waiting(entries: readonly OutboxEntry[]): OutboxEntry[] {
	return entries.filter((e) => e.state === "pending" || e.state === "sending");
}

/**
 * One pass over the outbox, in order: due entries are sent one at a time, entries older than
 * 30 days are abandoned, and nothing is sent while offline. Returns every entry, updated.
 * `onChange` sees each step, so the interface shows « Envoi… » while a send is in flight.
 */
export async function flush(
	entries: readonly OutboxEntry[],
	send: (action: OutboxAction) => Promise<unknown>,
	options: {
		now: () => number;
		online: () => boolean;
		onChange?: (entries: OutboxEntry[]) => void;
	},
): Promise<OutboxEntry[]> {
	const out = [...entries];
	const update = (index: number, entry: OutboxEntry) => {
		out[index] = entry;
		options.onChange?.([...out]);
	};
	for (let i = 0; i < out.length; i++) {
		const entry = out[i] as OutboxEntry;
		if (entry.state !== "pending" && entry.state !== "sending") {
			continue;
		}
		const now = options.now();
		if (now - entry.createdAt > ABANDON_AFTER) {
			update(i, { ...entry, state: "abandoned" });
			continue;
		}
		if (entry.notBefore > now || !options.online()) {
			continue;
		}
		update(i, { ...entry, state: "sending" });
		try {
			update(i, succeeded(entry, await send(entry.action)));
		} catch (error) {
			update(i, failed(entry, error, options.now()));
		}
	}
	return out;
}
