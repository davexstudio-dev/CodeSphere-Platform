# PWA : essai de Serwist avec OpenNext sur Cloudflare Workers (#249)

L'issue demande de commencer par un essai : Serwist (ou équivalent) fonctionne-t-il avec OpenNext sur
Cloudflare Workers ? Réponse : **le plugin de build de Serwist, non ; son runtime, oui**, avec le service
worker compilé au build. Essais faits localement avec `opennextjs-cloudflare build`, `wrangler dev --local`
et un vrai Chrome (Playwright).

## Ce qui a été essayé

| Essai | Résultat |
| --- | --- |
| `@serwist/next` | Non tenté : c'est un plugin webpack, et Next 16 comme OpenNext construisent avec Turbopack. |
| `@serwist/turbopack` (route `/serwist/[path]` qui compile le worker avec esbuild) | Le build Next passe, mais le bundling OpenNext échoue (`esbuild-wasm` introuvable). Avec `esbuild-wasm` ajouté, le build passe, **mais le Worker répond 500 sur `/serwist/sw.js`** : le journal montre `(serwist) Using esbuild to bundle the service worker` exécuté à la requête, ce que Workers ne peut pas faire. La route « prégénérée » n'est pas servie par OpenNext sans cache incrémental. |
| Runtime `serwist` (cœur, sans plugin Next) avec un service worker compilé au build par esbuild vers `public/sw.js` | **Fonctionne.** Fichier statique servi par les assets du Worker (`text/javascript`, `max-age=0, must-revalidate`). |

Décision : `serwist` (stratégies, précache, expiration) + `apps/web/scripts/build-sw.mjs`, lancé par
`build` et `cf:build`. Aucun code n'est compilé à la requête.

## Ce que fait le service worker (et seulement cela)

- précache la page `/offline` (une route Next, bilingue, sans script), renouvelée à chaque déploiement ;
- met en cache, en cache-first, les fichiers `/_next/static/*` (immuables, nommés par leur hash), 200 entrées, 30 jours ;
- répond par `/offline` à une navigation de page quand le réseau échoue.

Il ne met **jamais** en cache une page, ni `/api`, `/rpc`, `/mcp`, ni rien d'une autre origine : les données
restent dans le cache de requêtes persistant (IndexedDB), qu'il ne touche pas. Les redirections OAuth
(`/api/auth/*`) ne passent pas par lui. Pas de notifications push ni de synchronisation en arrière-plan.

## Pièges rencontrés

- `/offline.html` : les assets du Worker répondent par une **redirection 307 vers `/offline`**, et un
  navigateur refuse de servir une réponse redirigée à une navigation. `next start` (CI, Docker) ne sert
  de son côté `public/` qu'au nom exact : `/offline` n'y existe pas, l'installation du worker échoue et
  l'enregistrement disparaît sans erreur visible. D'où une **route** `/offline`, qui marche dans les deux cas.
- `pkill -f` dans un script de test tue le shell qui l'a lancé (anecdotique, mais a coûté un essai).
- Les workflows `preview.yml`, `staging.yml` et `deploy-worker.yml` appelaient `opennextjs-cloudflare build`
  directement : ils passent maintenant par `bun run cf:build`, sinon `public/sw.js` n'existait pas.

## Vérifié

- Worker local (`wrangler dev --local`) et `next start`, dans Chrome : le worker s'enregistre et s'active ;
  la page est contrôlée après rechargement ; les caches ne contiennent que `/offline` et des fichiers
  `/_next/static/` ; une navigation hors réseau affiche « Vous êtes hors ligne / You are offline » ; le retour
  en ligne sert la vraie page.
- `Page.getInstallabilityErrors` (protocole Chrome) : seule erreur `in-incognito` (le contexte de test est
  éphémère) ; le manifeste n'a aucune erreur.
- `apps/e2e/tests/pwa.e2e.ts` rejoue cela en CI (`next start`).

## Reste à confirmer sur un vrai déploiement

- l'installation sur un téléphone (Android Chrome, iOS « Ajouter à l'écran d'accueil ») : non testée ici ;
- les icônes (`apps/web/public/icons`) sont générées par `apps/e2e/generate-pwa-icons.mjs` à partir des
  couleurs de la marque, un dessin provisoire en attendant un logo.
