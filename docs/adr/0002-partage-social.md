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

## Résultat du spike (#264) : go, avec réserves

Mesuré le 2026-10-17 sur `@opencoredev/social-sdk@0.5.0` (épinglée exactement dans `packages/social`).

**Constaté**
- Publié sur npm (version `0.5.0`, dernière modification 2026-09-24), MIT, **aucune dépendance d'exécution**, 1,4 Mo, ESM seul, `engines: node >=22.12`. Pré-1.0 : l'API peut changer, d'où l'épinglage et la couche `SocialPublisher`.
- **Bun 1.4.2 : OK.** Le vrai adaptateur Bluesky tourne sous Bun contre un faux serveur (connexion, puis un seul `createRecord` avec le jeton porteur) et le `mockBackend` aussi : 10 tests dans `packages/social`.
- L'idempotence du SDK est **optionnelle** : sans `idempotencyStore`, rien n'empêche un double envoi. Avec `MemoryIdempotencyStore`, une même clé n'envoie qu'une fois. Le magasin en mémoire se perd au redémarrage : la carte #265 doit fournir un magasin adossé à la base (`social_posts`).
- **Bluesky** : l'adaptateur veut un `accessJwt` de courte durée et ne le renouvelle pas. `packages/social` ouvre donc une session (mot de passe d'application) à chaque publication, sans conserver de jeton. Acceptable pour un clic d'Admin.
- Les résultats `unknown` / `cancelled` du SDK sont rendus comme `unknown` : ne jamais renvoyer sans vérifier. Un échec `rate-limited` est marqué réessayable.

**Choix de la première plateforme : Bluesky.** Mot de passe d'application sans revue d'application ni API payante ; contrairement à X (payant), LinkedIn, Instagram et TikTok (revue). Threads est la suite logique.

**Non vérifié (à faire avant la production)**
- Aucune publication réelle : il faut un compte Bluesky officiel et un mot de passe d'application pour un essai bout en bout.
- Le serveur de production est sous Docker : l'image Bun n'a pas été reconstruite avec ce paquet.
- Le comportement exact de Bluesky pour la détection des liens dans le texte (aperçu cliquable) n'a pas été observé sur le vrai service.
- Le code de l'adaptateur n'a pas été audité ligne à ligne ; seuls son API, ses types et son comportement sur un faux serveur l'ont été.

**Variables d'environnement prévues** (optionnelles, fonction désactivée si absentes) : `BLUESKY_SERVICE`, `BLUESKY_IDENTIFIER`, `BLUESKY_APP_PASSWORD`. Elles ne sont pas encore dans `apps/server/.env.schema` : c'est la carte #265.

## Publication par un Admin (#265) : ce qui est en place

- **Procédure** `admin.social.publish` (Admin seulement, non exposée en REST ni MCP) et `admin.social.status` (plateformes actives). Entrée : `type` (`question` | `hackathon`), `id` (id de la Question ou slug), `platform`, `text` facultatif (le titre par défaut). Limite de 10 publications par heure et par Admin.
- **Verrou d'idempotence** : la table `social_post` (clé unique `share:{type}:{id}:{platform}`) est réclamée **avant** tout envoi. Un second clic ou une relance ne republie pas. Une ligne `pending` ou `unknown` n'est jamais renvoyée à l'aveugle (la plateforme a peut-être le post) : réponse `CONFLICT`. Seul un échec de connexion au compte (rien n'a été envoyé) est marqué réessayable.
- **Contenu refusé** : introuvable ou supprimé (`NOT_FOUND`), écrit par un Agent (`CONFLICT`). Le lien publié est le lien canonique construit avec `PUBLIC_SITE_URL`.
- **Audit** : `social.publish` à la réclamation, `social.retry` à une reprise.
- **Désactivé par défaut** : sans `BLUESKY_IDENTIFIER`, `BLUESKY_APP_PASSWORD` **et** `PUBLIC_SITE_URL`, la procédure répond `SERVICE_UNAVAILABLE`.
- **Envoi par l'outbox** : `publish` réserve la ligne et écrit l'événement `social.publish_requested` dans la même requête ; le consommateur `social` envoie. La ligne passe de `pending` à `sending` avant tout envoi : une relivraison ne republie pas, et un plantage en plein envoi ne renvoie rien. L'écran `/admin/social` suit les publications récentes. Après 15 minutes, une ligne restée `pending` devient un échec réessayable (rien n'est parti), une ligne restée `sending` devient `unknown`.
- **Pas encore fait** : publication réelle depuis le Worker à vérifier sur staging (#322 : le SDK n'y a pas encore tourné). Un post `processing` reste affiché tel quel : le SDK ne donne pas de lecture de son état, il n'est donc ni interrogé ni renvoyé.

## LinkedIn et X (ajoutés à #265)

`SocialPlatform` vaut maintenant `bluesky | linkedin | x`. Le publisher route chaque post vers la plateforme demandée (`publish(post, platform)`) ; seules les plateformes dont **toutes** les variables sont présentes sont actives, une configuration partielle est ignorée.

| Plateforme | Variables | Identifiant du compte | Longueur |
|---|---|---|---|
| Bluesky | `BLUESKY_IDENTIFIER`, `BLUESKY_APP_PASSWORD` (`BLUESKY_SERVICE`) | DID | 300 caractères, lien compris |
| LinkedIn | `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_AUTHOR` (`urn:li:person:…` ou `urn:li:organization:…`), `LINKEDIN_API_VERSION` (défaut 202609) | l'URN | 3000 caractères |
| X | `X_ACCESS_TOKEN`, `X_USER_ID` | id numérique | 280, lien compté 23, emoji et texte non latin comptés double |

Vérifié : les vrais adaptateurs LinkedIn et X du SDK tournent sous Bun contre un faux serveur (une seule requête de publication, jeton porteur, lien dans le texte ; un jeton refusé n'est pas « publié »).

**Limite importante** : ces deux plateformes utilisent des jetons OAuth qui expirent (à ma connaissance : ~2 h pour X, ~60 jours pour LinkedIn ; non revérifié). Un jeton statique en variable d'environnement ne suffit donc pas pour X au-delà d'un essai. Le stockage chiffré et le renouvellement sont la carte #266.

**Non vérifié** : aucune publication réelle sur ces deux réseaux ; les droits (`w_member_social` / `w_organization_social` chez LinkedIn, `tweet.write` chez X), l'éventuelle revue d'application de LinkedIn et le coût d'accès à l'API X ne sont pas confirmés ici.

## Stockage chiffré et renouvellement des jetons (#266)

Les jetons de X et de LinkedIn ne vivent plus dans l'environnement : un Admin connecte le compte depuis `/admin/social` (OAuth 2.0 avec PKCE S256), et le serveur le garde en base.

- **Chiffrement.** AES-256-GCM, clé dérivée par HKDF-SHA-256 d'un secret dédié `SOCIAL_CREDENTIALS_SECRET` (32 caractères au moins, distinct du secret d'authentification : tourner l'un ne verrouille pas l'autre). IV aléatoire par valeur, plateforme liée comme donnée authentifiée : une valeur recopiée sur une autre ligne ou altérée ne s'ouvre pas. Rien de lisible en base hors le nom public du compte ; ni jeton ni réponse de la plateforme dans les messages, les journaux ou l'audit. Changer le secret rend les comptes illisibles : on les reconnecte.
- **Renouvellement.** Avant l'expiration (fenêtre de 5 minutes), par **un seul worker à la fois** : bail en base (`social_credential_lock`, expire seul si son détenteur meurt), les publications concurrentes attendent le détenteur (15 s) puis relisent le jeton renouvelé sans rien échanger. Le jeton de renouvellement de X est à usage unique et tourne : le nouveau est enregistré **avant** d'être utilisé (écriture conditionnelle sur la révision, réessayée en cas d'erreur transitoire), jamais le contraire. Un compte dont la plateforme refuse le renouvellement est marqué « à reconnecter » ; le cas d'un Admin qui reconnecte pendant un renouvellement est tranché par la révision (le plus récent gagne).
- **SDK.** `CredentialManager` (verrou + comparaison de révision) et `refreshOAuthToken`, `xOAuth`, `linkedinOAuth` sont utilisés ; `ConnectionManager` ne l'est pas (pensé pour des locataires et des octrois, un compte officiel par plateforme n'en a pas besoin). Son `rotate` échoue au lieu d'attendre quand le verrou est pris : `waitingLock` l'enveloppe.
- **Connexion.** La tentative (`state`, vérificateur PKCE chiffré) est en base, à usage unique, liée à l'Admin qui l'a démarrée, valable 10 minutes. Le retour est `${PUBLIC_SITE_URL}/admin/social/callback`.
- **Échec d'authentification.** Jamais présenté comme « publié » : rien n'a été envoyé, la publication est `failed` et réessayable, avec un message qui dit quoi faire (reconnecter). Un 401 de la plateforme porte le drapeau `authFailure`.
- **Tests.** Deux publications simultanées ne renouvellent qu'une fois (mémoire et Postgres) ; le jeton tourné est enregistré avant la requête de publication.

Limites : LinkedIn ne donne de jeton de renouvellement qu'à certaines applications (sinon, reconnecter avant ~60 jours) ; l'accès à l'API X est payant ; aucune publication réelle n'a été faite sur ces réseaux. Les variables statiques (`X_ACCESS_TOKEN`, `LINKEDIN_ACCESS_TOKEN`) restent un repli d'essai, ignoré dès que l'application OAuth (`X_CLIENT_ID`, `LINKEDIN_CLIENT_ID`) est configurée.
