import type { Permissions } from "@codesphere/auth/access";
import { ORPCError } from "@orpc/server";

import { requirePermission } from "./authorization";
import { impl } from "./index";

/**
 * The guard of an admin procedure (#285): a staff session whose role holds `permissions`, else the
 * typed UNAUTHORIZED / FORBIDDEN error declared on the admin contract.
 */
export const staffMay = (permissions: Permissions) =>
	impl.middleware(async ({ context, next }) => {
		const guard = requirePermission(context.session, permissions);
		if (!guard.ok) {
			throw new ORPCError(guard.code);
		}
		return next();
	});
