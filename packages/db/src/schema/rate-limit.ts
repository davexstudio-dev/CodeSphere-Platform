import {
	bigint,
	index,
	integer,
	pgTable,
	primaryKey,
	text,
} from "drizzle-orm/pg-core";

// Fixed-window counters of the shared rate limiter (#246). One row per limiter key and window; a
// hit is one atomic upsert, so every instance and every restart sees the same count. Rows are
// purged once `expires_at` (epoch ms) has passed.
export const rateLimits = pgTable(
	"rate_limits",
	{
		key: text("key").notNull(),
		// Epoch ms of the start of the window, aligned on the window length.
		windowStart: bigint("window_start", { mode: "number" }).notNull(),
		hits: integer("hits").notNull(),
		expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.key, t.windowStart] }),
		// The purge scans by expiry.
		index("rate_limits_expires_idx").on(t.expiresAt),
	],
);
