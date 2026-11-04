import { drizzle } from "drizzle-orm/node-postgres";

import type { DatabaseConfig } from "./config";
import { relations } from "./relations";

export { DatabaseUnavailableError } from "./unavailable";

export function createDb(env: DatabaseConfig) {
	return drizzle({
		connection: {
			connectionString: env.DATABASE_URL,
			// Fail fast when the host does not answer, so /ready reports SERVICE_UNAVAILABLE
			// within the healthcheck timeout instead of hanging (#60).
			connectionTimeoutMillis: 3_000,
			// The integration suite opens one pool per test file in a single process: CI sets a short idle
			// timeout so the pools of finished files release their connections (Postgres caps at 100).
			idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_MS) || undefined,
		},
		relations,
	});
}

export type Database = ReturnType<typeof createDb>;
