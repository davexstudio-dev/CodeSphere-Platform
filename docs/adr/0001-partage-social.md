# ADR 0001 : Partage social et intégration de Social SDK

Statut : proposé. Date : 2026-10-17.

## Contexte

On veut que des contenus (Question, Answer acceptée, Hackathon, Milestone) puissent être partagés sur les réseaux. La piste donnée est [`opencoredev/social-sdk`](https://github.com/opencoredev/social-sdk) (`@opencoredev/social-sdk`, MIT).

Ce que le SDK est réellement : un client TypeScript **serveur** qui **publie** (`social.posts.publish`) vers X, Threads, Bluesky, YouTube, TikTok, Instagram, LinkedIn, en direct ou via Zernio, Post for Me, PostFast, Postiz, Buffer. Il exige Node 22.12+ ou Bun, garde les tokens hors du navigateur, et fournit un `mockBackend` (`@opencoredev/social-sdk/testing`). Ce n'est **pas** un bouton « Partager » : il ne sert pas un visiteur qui veut partager une Question depuis son propre compte.

Constats sur le dépôt :

- `apps/web/src/app/(app)/questions/[id]/page.tsx` rend la Question **côté navigateur** : aucun `generateMetadata`, donc aucun aperçu (Open Graph) quand le lien est collé sur un réseau. Seul `legal/[page]` génère des métadonnées.
- Le web tourne sur Cloudflare Workers (OpenNext), le serveur sur Bun (`apps/server`). Le SDK ne peut vivre que dans `apps/server`.
- Il existe déjà des briques réutilisables : `audit.ts`, limites de débit (`rate-limit.ts`), outbox prévue (#259), « fabrique » d'adaptateurs prévue pour les paiements (#260), `varlock` pour l'environnement.

## Décision

Deux besoins distincts, deux mécanismes, livrés dans cet ordre.

### Phase 1 : lien partageable (sans SDK, valeur immédiate)

Utile à tous les visiteurs, zéro token, zéro dépendance.

1. `generateMetadata` sur `questions/[id]` (et Hackathon) : `title`, `description` (extrait Markdown nettoyé), `openGraph`, `twitter: summary_large_image`, URL canonique. Récupération serveur via le client oRPC en lecture publique ; Question supprimée, fermée sans contenu public ou d'un Member anonymisé : métadonnées génériques.
2. Image OG dynamique (`opengraph-image.tsx`, titre + Tags + score) compatible Workers.
3. Composant `ShareMenu` dans `packages/ui`/`apps/web` : `navigator.share` quand disponible, sinon liens d'intention (X, LinkedIn, WhatsApp, Telegram, Facebook) + « Copier le lien ». WhatsApp est prioritaire pour le public visé. Pas de SDK tiers de widgets (CSP + poids, cf. mode économiseur de données #250).
4. Lien suivi par un paramètre `?ref=share` (pas de cookie), pour mesurer.

### Phase 2 : publication par la plateforme (Social SDK)

Cas d'usage : comptes officiels CodeSphere qui relaient un contenu choisi par un **Admin** (Answer acceptée marquante, rappel de Milestone, résultat de Hackathon).

- Nouveau paquet `packages/social` : fine couche sur le SDK, exposant `SocialPublisher.publish({ content, platforms })`. Le reste du code n'importe jamais `@opencoredev/social-sdk` directement (même principe que la fabrique PSP de #260), ce qui permet de changer de backend ou de désactiver la fonction.
- Backend choisi par configuration : `mockBackend` en test et en local, adaptateurs directs ou managé en préproduction/production. Variables optionnelles dans `apps/server/.env.schema` (jetons des comptes officiels), fonction **désactivée si absentes** (comme `RESEND_API_KEY`).
- Procédure oRPC `admin.social.publish`, derrière le rôle Admin existant, ajoutée au contrat. Contenu : texte + lien canonique ; seulement du contenu public.
- `idempotencyKey = share:{type}:{id}:{platform}` : une publication par contenu et par plateforme, relance sûre.
- Exécution via l'outbox (#259) pour ne pas bloquer la requête et gérer les résultats `processing` / `uncertain` du SDK (un résultat par destination, à stocker). En attendant #259 : appel synchrone avec limite de débit.
- Traçabilité : entrée dans `audit` (qui a publié quoi, où, résultat). Table `social_posts` (contenu, plateforme, état, id externe).
- Contenu d'un Agent : refusé ou balisé « agent » conformément à la règle existante.

### Phase 3 : comptes connectés par les Members (reportée)

Publier depuis le compte du Member exige OAuth par plateforme, stockage chiffré de tokens, suppression à la clôture du compte (RGPD, cf. `docs/research/gdpr-african-laws.md`), et des validations d'application côté X/LinkedIn/Instagram. Coût élevé, valeur incertaine face au `ShareMenu`. Non planifiée avant retour utilisateurs.

## Alternatives écartées

- **Tout faire avec le SDK** : ne répond pas au partage par un visiteur, impose des tokens pour une fonction triviale.
- **Widgets/scripts de réseaux sociaux** : traçage, CSP, poids, contraire au mode économiseur de données et au RGPD.
- **Appeler les API des réseaux à la main** : plus de code à maintenir que l'adaptateur du SDK pour la Phase 2.

## Risques et points à vérifier avant la Phase 2

- **Maturité du SDK** : au moment de l'analyse, aucune release ni version n'est visible sur la page GitHub. Vérifier la version publiée sur npm, épingler une version exacte, lire sa matrice de capacités et son code des adaptateurs retenus avant adoption.
- **Éligibilité des plateformes** : l'accès à l'API X est payant, LinkedIn/Instagram/TikTok demandent une revue d'application. Commencer par **Bluesky** et **Threads** (accès simple), ou un backend managé.
- **Secrets** : tokens uniquement dans `apps/server` (jamais dans `apps/web`, jamais dans les spans OTel).
- **Modération** : publication manuelle par Admin uniquement ; aucune publication automatique au MVP.
- **Compatibilité** : le serveur de production est sur Bun (vérifier la contrainte Node 22.12+ du SDK dans l'image Docker).

## Découpage proposé en cartes

1. SSR des métadonnées Open Graph pour Question et Hackathon + image OG.
2. `ShareMenu` (Web Share, intentions, copier le lien) + clés i18n FR/EN.
3. Spike : installer le SDK dans `packages/social`, test `mockBackend`, vérifier Bun, choisir la première plateforme.
4. Publication Admin (contrat, procédure, audit, table, idempotence), puis passage par l'outbox (#259).

Terme à ajouter à `CONTEXT.md` si adopté : **Partage** (lien d'un contenu public vers un réseau) distinct de **Publication sociale** (envoi par un Admin vers un compte officiel).
