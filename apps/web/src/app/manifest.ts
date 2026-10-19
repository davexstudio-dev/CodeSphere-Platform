import type { MetadataRoute } from "next";

// Installable web app (#249). Colours are the brand's (`--primary`, `--background` of the UI
// package) as hex, rendered by apps/e2e/generate-pwa-icons.mjs together with the icons.
export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "CodeSphere Platform",
		short_name: "CodeSphere",
		description: "Plateforme d'échange pour développeurs africains",
		start_url: "/",
		scope: "/",
		display: "standalone",
		background_color: "#fcf6ee",
		theme_color: "#a8432a",
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
