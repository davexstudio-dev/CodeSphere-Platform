import type { Database } from "@codesphere/db";

import { type Consumer, localQueue } from "./consumer";
import { consumers as defaultConsumers } from "./consumers";
import { drainOutbox, type EventQueue, type QueueMessage } from "./relay";

/** Cloudflare Queues' producer binding, as far as the relay needs it. */
export type QueueBinding = {
	sendBatch(
		messages: { body: QueueMessage; contentType?: "json" }[],
	): Promise<void>;
};

/** The relay's queue on Cloudflare: each event is one JSON message. */
export function cloudflareQueue(binding: QueueBinding): EventQueue {
	return {
		sendBatch: (messages) =>
			binding.sendBatch(
				messages.map((body) => ({ body, contentType: "json" as const })),
			),
	};
}

/**
 * Where there is no Queues binding (the Bun server, local development), the relay hands each event
 * straight to the consumers, in process: the same guarantees, no network.
 */
export function startOutboxRelay(
	db: Database,
	options: {
		intervalMs?: number;
		consumers?: readonly Consumer[];
		onError?: (error: unknown) => void;
	} = {},
) {
	const queue = localQueue(db, options.consumers ?? defaultConsumers);
	let running = false;
	const tick = async () => {
		// A run still going is left alone: two relays would only fight over the same events.
		if (running) {
			return;
		}
		running = true;
		try {
			await drainOutbox(db, queue);
		} catch (error) {
			options.onError?.(error);
		} finally {
			running = false;
		}
	};
	const timer = setInterval(tick, options.intervalMs ?? 5000);
	// Does not keep the process alive on its own.
	timer.unref?.();
	return () => clearInterval(timer);
}
