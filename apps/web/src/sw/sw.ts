/// <reference lib="webworker" />
// The service worker (#249), built to public/sw.js by scripts/build-sw.mjs. Serwist's runtime, not
// its Next.js plugin: the plugins bundle the worker at request time, which a Cloudflare Worker
// cannot do (see docs/research/249-pwa-opennext-trial.md).
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from "serwist";

import { isPageNavigation, isStaticAsset, OFFLINE_URL } from "./routes";

declare const self: ServiceWorkerGlobalScope;
// Replaced at build time: the offline page is fetched again after each deployment.
declare const __BUILD_ID__: string;

const serwist = new Serwist({
	precacheEntries: [{ url: OFFLINE_URL, revision: __BUILD_ID__ }],
	skipWaiting: true,
	clientsClaim: true,
	runtimeCaching: [
		{
			matcher: ({ url }) => isStaticAsset(url, self.location.origin),
			handler: new CacheFirst({
				cacheName: "next-static",
				plugins: [
					new ExpirationPlugin({
						maxEntries: 200,
						maxAgeSeconds: 30 * 24 * 60 * 60,
					}),
				],
			}),
		},
		{
			// Network only, so a page is never served from here; the fallback below answers when the
			// network fails.
			matcher: ({ request, url }) =>
				isPageNavigation(request, url, self.location.origin),
			handler: new NetworkOnly(),
		},
	],
	fallbacks: {
		entries: [
			{
				url: OFFLINE_URL,
				// The same rule as the route above: an API or cross-origin navigation never gets it.
				matcher: ({ request }) =>
					isPageNavigation(request, new URL(request.url), self.location.origin),
			},
		],
	},
});

serwist.addEventListeners();
