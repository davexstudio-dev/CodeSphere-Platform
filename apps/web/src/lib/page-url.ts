import { headers } from "next/headers";

/** The public URL of a path on the host serving this request (behind Caddy or Cloudflare). */
export async function publicPageUrl(path: string): Promise<string> {
	const h = await headers();
	const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3001";
	const proto =
		h.get("x-forwarded-proto") ??
		(host.startsWith("localhost") || host.startsWith("127.")
			? "http"
			: "https");
	return `${proto}://${host}${path}`;
}
