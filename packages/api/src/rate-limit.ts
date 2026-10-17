import { MemoryRateLimiter } from "@orpc/ratelimit/memory";
import { ORPCError } from "@orpc/server";

const HOUR = 60 * 60 * 1000;

// Per Member write limits (spec §3, #72). In memory: each process counts for itself, which is what
// the MVP asks for; a shared store would change the limiter, not the callers.
export const QUESTIONS_PER_HOUR = 10;
export const ANSWERS_PER_HOUR = 30;

type Limiter = Pick<MemoryRateLimiter, "limit">;

export const questionLimiter = new MemoryRateLimiter({
	maxRequests: QUESTIONS_PER_HOUR,
	window: HOUR,
});

export const answerLimiter = new MemoryRateLimiter({
	maxRequests: ANSWERS_PER_HOUR,
	window: HOUR,
});

/**
 * Counts one write of `key` and throws the contract's TOO_MANY_REQUESTS past the limit, with
 * `retryAfter` in seconds until the window resets.
 */
export async function consume(
	limiter: Limiter,
	key: string,
	now: () => number = Date.now,
) {
	const result = await limiter.limit(key);
	if (!result.success) {
		const retryAfter = Math.max(
			1,
			Math.ceil(((result.reset ?? now()) - now()) / 1000),
		);
		throw new ORPCError("TOO_MANY_REQUESTS", { data: { retryAfter } });
	}
}

/** Posts to the official social accounts, per Admin: a slow, deliberate action (ADR 0001). */
export const SOCIAL_PUBLISHES_PER_HOUR = 10;

export const socialLimiter = new MemoryRateLimiter({
	maxRequests: SOCIAL_PUBLISHES_PER_HOUR,
	window: HOUR,
});
