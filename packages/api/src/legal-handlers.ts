import { currentLegalVersions } from "@codesphere/db/legal";
import { ORPCError } from "@orpc/server";

import { impl } from "./index";
import {
	getDraft,
	getVersion,
	history,
	overview,
	publishDraft,
	publishedText,
	saveDraft,
} from "./legal";
import { staffMay } from "./staff-guard";

// The signed-in staff member behind a write; `staffMay` has already refused anonymous calls.
const actorOf = (session: { user: { id: string } } | null) => {
	if (!session) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return session.user.id;
};

/** The public read of the legal documents (#341). The texts are public, the drafts never are. */
export const createLegalHandlers = () => ({
	get: impl.legal.get.handler(({ context, input }) =>
		publishedText(context.db, input),
	),
	versions: impl.legal.versions.handler(({ context }) =>
		currentLegalVersions(context.db),
	),
});

/** The editor of the legal documents: Admin and super admin only (a Moderator is FORBIDDEN). */
export const createLegalAdminHandlers = () => ({
	list: impl.admin.legal.list
		.use(staffMay({ legal: ["manage"] }))
		.handler(async ({ context }) => ({ items: await overview(context.db) })),
	draft: impl.admin.legal.draft
		.use(staffMay({ legal: ["manage"] }))
		.handler(({ context, input }) => getDraft(context.db, input)),
	saveDraft: impl.admin.legal.saveDraft
		.use(staffMay({ legal: ["manage"] }))
		.handler(async ({ context, input, errors }) => {
			const outcome = await saveDraft(
				context.db,
				actorOf(context.session),
				input,
			);
			if (!outcome.ok) {
				throw errors.CONFLICT({ data: { version: outcome.version } });
			}
			return outcome.draft;
		}),
	publish: impl.admin.legal.publish
		.use(staffMay({ legal: ["manage"] }))
		.handler(async ({ context, input, errors }) => {
			const outcome = await publishDraft(
				context.db,
				actorOf(context.session),
				input,
			);
			if (!outcome.ok) {
				throw outcome.code === "NOT_FOUND"
					? errors.NOT_FOUND()
					: errors.CONFLICT({ data: { version: outcome.version } });
			}
			return outcome.version;
		}),
	history: impl.admin.legal.history
		.use(staffMay({ legal: ["manage"] }))
		.handler(async ({ context, input }) => ({
			items: await history(context.db, input),
		})),
	version: impl.admin.legal.version
		.use(staffMay({ legal: ["manage"] }))
		.handler(async ({ context, input, errors }) => {
			const found = await getVersion(context.db, input);
			if (!found) {
				throw errors.NOT_FOUND();
			}
			return found;
		}),
});
