// Keeps staging out of public reach: HTTP Basic auth in front of the whole Worker, switched on by
// the secret STAGING_ACCESS_PASSWORD. Unset (production, previews, local) = no gate at all.
//
// Some calls come from machines that cannot type a password, and stay open:
//   - /api/v1/health         the deploy's liveness check
//   - /api/auth/callback/*   the identity providers' redirect (staging is the OAuth proxy
//   - /api/auth/oauth-proxy-callback  callback of every preview, #100), signed by OAUTH_PROXY_SECRET
//   - /webhooks/*            Resend, which verifies its own signature (#200)

const OPEN_PATHS = ["/api/v1/health", "/api/auth/oauth-proxy-callback"];
const OPEN_PREFIXES = ["/api/auth/callback/", "/webhooks/"];

export function isOpenPath(pathname: string): boolean {
	return (
		OPEN_PATHS.includes(pathname) ||
		OPEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))
	);
}

async function digest(value: string): Promise<Uint8Array> {
	return new Uint8Array(
		await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
	);
}

/** Compares two secrets through their digests, in time independent of where they differ. */
async function sameSecret(a: string, b: string): Promise<boolean> {
	const [x, y] = await Promise.all([digest(a), digest(b)]);
	let diff = 0;
	for (let i = 0; i < x.length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 1);
	return diff === 0;
}

/** The password of a `Basic` header; the user name is free. */
function passwordOf(header: string | null): string | undefined {
	if (!header?.startsWith("Basic ")) return undefined;
	try {
		const decoded = atob(header.slice(6).trim());
		const colon = decoded.indexOf(":");
		return colon < 0 ? undefined : decoded.slice(colon + 1);
	} catch {
		return undefined;
	}
}

/** `undefined` lets the request through; otherwise the 401 to send back. */
export async function stagingGate(
	request: Request,
	password: string | undefined,
): Promise<Response | undefined> {
	if (!password) return undefined;
	if (isOpenPath(new URL(request.url).pathname)) return undefined;
	const given = passwordOf(request.headers.get("authorization"));
	if (given !== undefined && (await sameSecret(given, password))) {
		return undefined;
	}
	return new Response("Staging: authentication required.", {
		status: 401,
		headers: {
			"www-authenticate": 'Basic realm="CodeSphere staging", charset="UTF-8"',
			"cache-control": "no-store",
			"x-robots-tag": "noindex, nofollow",
			"content-type": "text/plain; charset=utf-8",
		},
	});
}
