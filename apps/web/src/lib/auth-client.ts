import { ac, roles } from "@codesphere/auth/access";
import {
	adminClient,
	emailOTPClient,
	inferAdditionalFields,
	lastLoginMethodClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { getServerUrl } from "./server-url";

export const authClient = createAuthClient({
	baseURL: new URL("/api/auth", getServerUrl()).toString(),
	// Typed mirror of the server's plugins (packages/auth): the admin plugin carries `role` and the
	// access control shared with the API; the other user fields are set server-side only.
	plugins: [
		emailOTPClient(),
		lastLoginMethodClient(),
		adminClient({ ac, roles }),
		inferAdditionalFields({
			user: {
				kind: { type: "string", required: false, input: false },
			},
		}),
	],
});
