import { redirect } from "next/navigation";

import { HAS_DATABASE } from "@/lib/deployment";
import { DEFAULT_CONSENT_VERSION } from "@/lib/legal";
import { getServerSession } from "@/lib/server-session";
import { client } from "@/utils/orpc";

import SignInForm from "./sign-in-form";

// A Member already signed in has nothing to do here: the server sends them on through
// /post-signin before the page renders (#121).
export default async function SignInPage() {
	const session = await getServerSession();
	if (session?.user) {
		redirect("/post-signin");
	}
	let consentVersion = DEFAULT_CONSENT_VERSION;
	if (HAS_DATABASE) {
		try {
			consentVersion = (await client.legal.versions({})).consent;
		} catch {
			// The auth server checks the version anyway; the default is the one of a fresh database.
		}
	}
	return <SignInForm consentVersion={consentVersion} />;
}
