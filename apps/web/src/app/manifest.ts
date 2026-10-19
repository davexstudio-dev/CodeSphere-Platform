import type { MetadataRoute } from "next";

import { BRAND } from "@/lib/brand";

// Installable web app (#249).
export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "CodeSphere Platform",
		short_name: "CodeSphere",
		description: "Plateforme d'échange pour développeurs africains",
		start_url: "/",
		scope: "/",
		display: "standalone",
		background_color: BRAND.background,
		theme_color: BRAND.primary,
		icons: [
			{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
			{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
			{
				src: "/icons/icon-maskable-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "maskable",
			},
		],
	};
}
