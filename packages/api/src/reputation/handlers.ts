import { impl } from "../index";
import {
	countryRanking,
	decodeRankingCursor,
	InvalidRankingCursorError,
	membersOfCountry,
	membersOfTag,
} from "./rankings";

// Public rankings (#242): no session needed.
export function createRankingsHandlers() {
	const offsetOf = (
		cursor: string | undefined,
		errors: {
			BAD_REQUEST: (options: {
				data: { issues: { path: string[]; message: string }[] };
			}) => Error;
		},
	) => {
		try {
			return decodeRankingCursor(cursor);
		} catch (err) {
			if (err instanceof InvalidRankingCursorError) {
				throw errors.BAD_REQUEST({
					data: { issues: [{ path: ["cursor"], message: "Invalid cursor" }] },
				});
			}
			throw err;
		}
	};
	return {
		countries: impl.rankings.countries.handler(({ context }) =>
			countryRanking(context.db),
		),
		byCountry: impl.rankings.byCountry.handler(({ context, input, errors }) =>
			membersOfCountry(
				context.db,
				input.country,
				offsetOf(input.cursor, errors),
				input.limit,
			),
		),
		byTag: impl.rankings.byTag.handler(({ context, input, errors }) =>
			membersOfTag(
				context.db,
				input.tag,
				offsetOf(input.cursor, errors),
				input.limit,
			),
		),
	};
}
