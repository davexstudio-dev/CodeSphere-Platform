import { sql } from "drizzle-orm";

import { type Consumer, effectOnce } from "./consumer";
import { socialConsumer } from "./social-consumer";

/**
 * The demonstration consumer (docs/outbox.md): counts the events it sees per type in `outbox_stats`.
 * Its effect and its marker are one statement, so a redelivered event is never counted twice.
 */
export const statsConsumer: Consumer = {
	name: "stats",
	types: "*",
	atomic: true,
	async handle(message, db) {
		await effectOnce(
			db,
			"stats",
			message.id,
			(mark) => sql`
				INSERT INTO outbox_stats (type, count)
				SELECT ${message.type}, 1 FROM ${mark}
				ON CONFLICT (type) DO UPDATE SET count = outbox_stats.count + 1, updated_at = now()`,
		);
	},
};

/** Every consumer the platform runs. Search index sync, notifications and payment reconciliation join here. */
export const consumers: readonly Consumer[] = [statsConsumer];

/** The consumers with what the deployment configured: the official social accounts. */
export const consumersWith = (
	social?: Parameters<typeof socialConsumer>[0],
): readonly Consumer[] => [...consumers, socialConsumer(social)];
