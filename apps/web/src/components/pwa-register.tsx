"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (#249) in production only: in development a worker would serve
 * stale chunks to the dev server. A failure is ignored, the site works without it.
 */
export function PwaRegister() {
	useEffect(() => {
		if (
			process.env.NODE_ENV !== "production" ||
			!("serviceWorker" in navigator)
		) {
			return;
		}
		void navigator.serviceWorker
			.register("/sw.js", { scope: "/" })
			.catch((error: unknown) => {
				// The site works without the worker: say why it is missing, do not break the page.
				console.warn("Service worker registration failed", error);
			});
	}, []);
	return null;
}
