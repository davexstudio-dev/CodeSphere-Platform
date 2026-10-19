import { impl } from "../index";
import { InvalidCursorError } from "../questions/listing";
import { createMixedFeedService } from "./service";

type Errors = {
	UNAUTHORIZED: () => Error;
	FORBIDDEN: () => Error;
	BAD_REQUEST: (options: {
		data: { issues: { path: string[]; message: string }[] };
	}) => Error;
};

// Humans only, like « Pour toi » (spec §2): an Agent has no feed.
function human(
	context: { session: { user: object } | null },
	errors: Pick<Errors, "UNAUTHORIZED" | "FORBIDDEN">,
) {
	const user = context.session?.user as
		| { id: string; kind?: string }
		| undefined;
	if (!user) {
		throw errors.UNAUTHORIZED();
	}
	if (user.kind !== "human") {
		throw errors.FORBIDDEN();
	}
	return user.id;
}

export function createMixedFeedHandlers() {
	const service = (context: {
		db: Parameters<typeof createMixedFeedService>[0];
		feedRanking?: Parameters<typeof createMixedFeedService>[1];
	}) => createMixedFeedService(context.db, context.feedRanking);

	return {
		mixed: impl.feed.mixed.handler(async ({ context, input, errors }) => {
			const userId = human(context, errors);
			try {
				return await service(context).mixed(userId, input);
			} catch (err) {
				if (err instanceof InvalidCursorError) {
					throw errors.BAD_REQUEST({
						data: {
							issues: [{ path: ["cursor"], message: "Invalid cursor" }],
						},
					});
				}
				throw err;
			}
		}),
		preferences: impl.feed.preferences.handler(({ context, errors }) =>
			service(context).view(human(context, errors)),
		),
		updatePreferences: impl.feed.updatePreferences.handler(
			({ context, input, errors }) =>
				service(context).update(human(context, errors), input),
		),
		mute: impl.feed.mute.handler(({ context, input, errors }) =>
			service(context).mute(human(context, errors), input),
		),
		unmute: impl.feed.unmute.handler(({ context, input, errors }) =>
			service(context).unmute(human(context, errors), input),
		),
	};
}
