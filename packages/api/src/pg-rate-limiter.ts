import type { Database } from "@codesphere/db";
import { rateLimits } from "@codesphere/db/schema/rate-limit";
import { lt, sql } from "drizzle-orm";

/** What `consume` needs from a limiter; the oRPC memory limiter and this one both fit. */
export type Limiter = {
	limit(key: string): Promise<{ success: boolean; reset?: number }>;
};

/** A fixed-window limiter every instance shares, because the counters live in Postgres (#246). */
export type LimiterFactory = (options: {
	/** Distinguishes limiters that share a key space (e.g. "question:agent"). */
	name: string;
	maxRequests: number;
	windowMs: number;
}) => Limiter;

// Fixed windows aligned on the window length (an hour, a UTC day): a burst can straddle a boundary
// and reach twice the limit across it. That is the accepted trade for a single atomic statement.

// About one call in a hundred also purges the expired windows: no scheduler is needed, and a purge
// that fails is only a missed clean-up.
const PURGE_ODDS = 0.01;

export function postgresLimiters(
	db: Database,
	now: () => number = Date.now,
	random: () => number = Math.random,
): LimiterFactory {
	return ({ name, maxRequests, windowMs }) => ({
		async limit(key) {
			const at = now();
			const windowStart = Math.floor(at / windowMs) * windowMs;
			const reset = windowStart + windowMs;
			// One statement: the increment is atomic, so concurrent writes on any instance are all counted.
			const [row] = await db
				.insert(rateLimits)
				.values({
					key: `${name}:${key}`,
					windowStart,
					hits: 1,
					expiresAt: reset,
				})
				.onConflictDoUpdate({
					target: [rateLimits.key, rateLimits.windowStart],
					// Capped just above the limit: a client hammering a closed door cannot grow the number.
					set: {
						hits: sql`LEAST(${rateLimits.hits} + 1, ${maxRequests + 1})`,
					},
				})
				.returning({ hits: rateLimits.hits });
			if (random() < PURGE_ODDS) {
				await db
					.delete(rateLimits)
					.where(lt(rateLimits.expiresAt, at))
					.catch(() => undefined);
			}
			if (!row) {
				// The upsert always returns its row; fail closed rather than let a write through.
				throw new Error("rate limiter: no counter returned");
			}
			return { success: row.hits <= maxRequests, reset };
		},
	});
}
