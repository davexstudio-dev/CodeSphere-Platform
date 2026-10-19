import { createLogger } from "@codesphere/logger";
import type { Context } from "./context";
import { NO_FARMING_LIMITS } from "./reputation/farming";

// Any query on it throws, like a database that is down.
const unavailableDb = new Proxy({} as Context["db"], {
	get() {
		throw new Error("database unavailable (test)");
	},
});

/**
 * A procedure context for tests: a silent logger, a fixed request id and build identity,
 * no session and a database that fails on any query. Override what a test exercises.
 */
export function testContext(overrides: Partial<Context> = {}): Context {
	return {
		session: null,
		db: unavailableDb,
		logger: createLogger({ level: "silent" }),
		requestId: "test",
		// Every Privilege is open so suites about other features need no earned Reputation; the
		// Privilege suites pass the real thresholds.
		privilegeThresholds: {
			flag: 0,
			propose_tag_edit: 0,
			downvote: 0,
			close_vote: 0,
			edit_tags: 0,
			submit_feed_item: 0,
		},
		// Anti-farming off, for the same reason: test accounts are brand new.
		farmingLimits: NO_FARMING_LIMITS,
		release: { version: "test", commit: "test" },
		...overrides,
	};
}
