"use client";

import { useQuery } from "@tanstack/react-query";

import { DEFAULT_CONSENT_VERSION } from "@/lib/legal";
import { orpc } from "@/utils/orpc";

/**
 * The consent version in force (#341), for the login dialog of the header: a counter read from the
 * database, the same one the auth server checks when it creates the account. The default stands in
 * until it is known, and where there is no database to ask.
 */
export function useConsentVersion(): string {
	const versions = useQuery({
		...orpc.legal.versions.queryOptions({ input: {} }),
		staleTime: 60 * 1000,
		// The default is a fine stand-in: no toast for a version that could not be read.
		meta: { silent: true },
	});
	return versions.data?.consent ?? DEFAULT_CONSENT_VERSION;
}
