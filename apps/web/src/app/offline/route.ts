import { BRAND } from "@/lib/brand";

// The page a navigation falls back to without network (#249), precached by the service worker at
// `/offline`. A route handler, not a file in public/: `next start` serves public files only under
// their exact name, while the Worker's assets answer `/offline.html` with a redirect, and a
// redirected response cannot answer a navigation. Static HTML, no script: it must render with
// nothing else available.
export const dynamic = "force-static";

const OFFLINE_HTML = `<!doctype html>
<html lang="fr">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Hors ligne · Offline — CodeSphere</title>
	<style>
		:root { color-scheme: light dark; }
		body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1.5rem;
			font-family: system-ui, sans-serif; background: ${BRAND.background}; color: #2b211b; }
		@media (prefers-color-scheme: dark) { body { background: ${BRAND.darkBackground}; color: #f5ede4; } }
		main { max-width: 28rem; }
		h1 { font-size: 1.5rem; margin: 0 0 .5rem; }
		p { line-height: 1.5; margin: 0 0 1.25rem; }
		a { color: ${BRAND.primary}; font-weight: 600; }
		@media (prefers-color-scheme: dark) { a { color: #e0846a; } }
	</style>
</head>
<body>
	<main>
		<h1>Vous êtes hors ligne</h1>
		<p>CodeSphere ne peut pas charger cette page sans connexion. Ce que vous avez déjà consulté reste disponible dans l'application ; vos réponses et votes en attente seront envoyés dès le retour du réseau.</p>
		<p><a href="/">Réessayer</a></p>
		<h1 lang="en">You are offline</h1>
		<p lang="en">CodeSphere cannot load this page without a connection. What you already viewed stays available in the app; your pending answers and votes will be sent when the network is back.</p>
		<p lang="en"><a href="/">Try again</a></p>
	</main>
</body>
</html>
`;

export function GET() {
	return new Response(OFFLINE_HTML, {
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			// Always revalidated: the worker keeps its own precached copy per deployment.
			"Cache-Control": "public, max-age=0, must-revalidate",
		},
	});
}
