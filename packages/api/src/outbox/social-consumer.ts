import type { SocialPublisher } from "@codesphere/social";

import {
	createShareTargetLoader,
	createSocialPostStore,
	SOCIAL_PUBLISH_REQUESTED,
	sendShare,
} from "../admin-social";
import type { Consumer } from "./consumer";

/**
 * Sends the posts an Admin asked for (#265). Not atomic: a post cannot share a statement with its
 * marker. A redelivery is harmless because `sendShare` takes a post only while it is `pending`.
 */
export function socialConsumer(social?: {
	publisher: SocialPublisher | null;
	siteUrl?: string;
}): Consumer {
	return {
		name: "social",
		types: [SOCIAL_PUBLISH_REQUESTED],
		async handle(message, db) {
			await sendShare(
				{
					store: createSocialPostStore(db),
					publisher: social?.publisher ?? null,
					siteUrl: social?.siteUrl,
					loadTarget: createShareTargetLoader(db),
				},
				String(message.payload.key),
			);
		},
	};
}
