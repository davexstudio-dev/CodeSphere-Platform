import { type NextRequest, NextResponse } from "next/server";

import { buildCsp, createNonce, SECURITY_HEADERS } from "@/lib/csp";

// Next.js proxy (formerly middleware): a CSP nonce per page request (#54). Next.js reads the
// nonce from the request's Content-Security-Policy header and stamps it on its scripts; the
// layout reads x-nonce for next-themes.
export function proxy(request: NextRequest) {
	const nonce = createNonce();
	const csp = buildCsp({
		nonce,
		dev: process.env.NODE_ENV === "development",
		serverUrl: process.env.NEXT_PUBLIC_SERVER_URL,
	});

	const requestHeaders = new Headers(request.headers);
	requestHeaders.set("x-nonce", nonce);
	requestHeaders.set("Content-Security-Policy", csp);

	const response = NextResponse.next({ request: { headers: requestHeaders } });
	response.headers.set("Content-Security-Policy", csp);
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(name, value);
	}
	return response;
}

export const config = {
	matcher: [
		{
			// Pages only: the API paths are the server's, static files carry no script.
			source:
				"/((?!api/|rpc|mcp|_next/static|_next/image|favicon.ico|robots.txt|og-default.png|sw.js|icons/|manifest.webmanifest).*)",
			// A prefetch is not rendered as a page: no nonce to draw.
			missing: [
				{ type: "header", key: "next-router-prefetch" },
				{ type: "header", key: "purpose", value: "prefetch" },
			],
		},
	],
};
