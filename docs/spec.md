# Spec MVP — CodeSphere Platform

Spec d'implémentation du MVP pour la Coupe d'Afrique des Développeurs 2026 (CADEV, Systalink). Il rassemble les décisions des trois cartes ; chaque section renvoie au ticket qui porte le détail, à consulter en cas de doute. Vocabulaire : [`CONTEXT.md`](../CONTEXT.md).

- [Carte : CodeSphere Platform](https://github.com/0xdaydy/systalink-challenge/issues/1) (produit, architecture)
- [Carte : Sécurité et conformité](https://github.com/0xdaydy/systalink-challenge/issues/20)
- [Carte : Livraison](https://github.com/0xdaydy/systalink-challenge/issues/28) (déploiement, branches, tests, versions)

## 1. Produit

Plateforme d'échange pour développeurs africains, par des développeurs : Q&R façon StackOverflow, flux « For You » par Tags façon daily.dev, infos hackathon façon DoraHacks. **Agent-native** (les agents IA sont des Members badgés, avec clé d'API, OpenAPI et MCP) et **local-first** (lecture du cache et file d'envoi hors-ligne ; le serveur reste autoritatif). UI en français et en anglais, langue déclarée par contenu.

### Calendrier et cadre CADEV ([#18](https://github.com/0xdaydy/systalink-challenge/issues/18))

| Étape | Dates |
|---|---|
| Fondations, contrats publiés, staging `develop` (Vercel + Workers) | 9–13 oct. (contrôle le 13) |
| Profil, Tags, flux, page CADEV, formulaire de Question | 13–17 oct. (contrôle le 17) |
| Questions, réponses, votes, hors-ligne, agents, API, MCP | 17–21 oct. (contrôle le 21) |
| Admin minimal, intégration | 21–22 oct. |
| Sécurité, pages légales, contenu de démo, répétition générale (23), dossier, **gel des fonctionnalités le 24 au soir** (`fix/*` seulement, sur décision du capitaine) | 23–24 oct. |
| **Dépôt** ; limite d'abord confirmée le 2026-10-09 au 25 oct., **repoussée au 15 nov. le 2026-10-19** par les organisateurs (heure supposée inchangée) | **15 nov. avant 17h00 GMT** |
| Vote entre participants d'un même pays, **obligatoire pour la prise en compte de la soumission** | 15 nov. 18h – 16 nov. 23h59 (décalé de 21 jours, calendrier officiel à confirmer) |
| Vote du public (10 % des points) | 17–20 nov., 23h59 (décalé de 21 jours, à confirmer) |
| Délibération du jury | 22 nov. (décalé de 21 jours, à confirmer) |
| Proclamation des résultats | à confirmer (15 nov. dans l'ancien règlement) |

Points de contrôle : 13, 17 et 21 oct. (staging à jour, parcours de démo rejoué, CI verte), gel le 24 au soir, répétition générale le 23. Obligations : déploiement sur un produit payant Systalink (Cloud Server Business, Dakar) ; composants tiers sous licence permissive uniquement (MIT, Apache 2.0, BSD ; GPL/AGPL/LGPL = irrecevable, art. 6 du règlement ; MPL-2.0 acceptée par l'organisateur, présente via `lightningcss`, à déclarer dans la partie « technologies » à la création du projet) ; usage de l'IA déclaré ; équipe de 4. Jury : pertinence 25 %, qualité technique 30 %, UX 20 %, innovation 15 %, public 10 %.

### Ligne de coupe

- **Indispensable** : SSO (GitHub, GitLab, Google) ; flux et Questions ; poser, répondre, voter, accepter ; page CADEV ; accès agent (clé, `/api/v1`, MCP) ; cache de lecture hors-ligne ; sécurité et pages légales ; déploiement.
- **Si le temps le permet** : brouillons et file d'envoi hors-ligne, anglais complet, filtres pays et langue.
- **Bonus** : PWA (ouvrir l'app sans réseau), mode économie de données, Bitbucket.
- **Ordre de repli** (retard > 2 jours au 18 oct.) : brouillons hors-ligne, puis anglais complet, puis filtres ; Agents/MCP en tout dernier recours. Si les fondations ne sont pas finies au 11 oct. : flux « Récents » seul (pas de Tags suivis).

### Démo (3 min)

Connexion GitHub → suivi de Tags → poser une Question → un agent répond via MCP → passage hors-ligne (envoi mis en file puis synchronisé).

## 2. Modèle de domaine ([#8](https://github.com/0xdaydy/systalink-challenge/issues/8), [#9](https://github.com/0xdaydy/systalink-challenge/issues/9))

Défini dans `CONTEXT.md`. Règles à implémenter :

- **Member** humain ou **Agent** ; un Agent a un **Owner** humain, peut poser, répondre et être accepté, **ne vote jamais**.
- **Question** : 1 à 5 Tags, langue `fr | en`, Markdown ≤ 20 000 caractères ; états open / answered / closed ; suppression douce ; édition libre par l'auteur, sans historique.
- **Answer** : une par Member et par Question, auto-réponse permise, pas de commentaires.
- **Accepted answer** : une seule, choisie (et changeable) par l'auteur de la Question.
- **Vote** : up/down, un par Member et par cible, modifiable et retirable, jamais sur son propre contenu ; **Score** = total net ; pas de réputation.
- **Tag** : création libre normalisée, suivi par Member, liste de départ amorcée (~30, dont `mobile-money`, `ussd`, `cadev-2026`).
- **Region** : pays (ISO alpha-2 africain ou `OTHER`) public + ville libre **privée par défaut**.
- **Admin** : désigné par `ADMIN_EMAILS` (emails vérifiés) ; ferme une Question, suspend un Member, édite le Hackathon (dates, Milestones, Prizes, critères) depuis l'administration ; le seed fournit les valeurs de départ.
- **Hackathon** (CADEV 2026 seul, seed) avec **Milestones** (compte à rebours, fuseau du lecteur), **Prizes**, **Judging criteria** ; possède un Tag dont les Questions apparaissent sur sa page. Lecture seule pour les Members et les agents (exposée dans le contrat) ; seul l'Admin l'édite.
- **Suppression de compte** : anonymisation (« Membre supprimé ») par défaut, ou suppression du contenu sauf les Answers acceptées chez autrui.
  - **Anonymisation, pas effacement** : la ligne `user` est conservée (le contenu y renvoie) ; nom, email, image, pays et ville sont écrasés, sessions et comptes liés supprimés. Un Agent supprimé est de même retiré (clé révoquée, hors liste et hors plafond de 3) mais sa ligne reste. Cela ne répond pas à une demande d'effacement légal : à valider avec la conformité avant de s'y fier.

## 3. Architecture

### Stack ([#10](https://github.com/0xdaydy/systalink-challenge/issues/10), [#16](https://github.com/0xdaydy/systalink-challenge/issues/16))

Bun partout + Turborepo ; `apps/server` Hono ; `apps/web` Next.js 16 (App Router) + TanStack Query + TanStack Form + Tailwind + shadcn/ui ; Postgres 18 + Drizzle (migrations versionnées, seed idempotent) ; better-auth ; Pino via `@codesphere/logger` (middleware Hono et non `@orpc/pino`, qui ne voit pas les routes better-auth `/api/auth/*` ni `/mcp` ; décision du 2026-10-11, #59) ; varlock pour la configuration ; Biome ; `bun test`.

- Code serveur : `packages/api/<domaine>/{handlers.ts,service.ts}` pour `questions`, `answers`, `votes`, `tags`, `feed`, `hackathons`, `members`, `agents`.
- Base : snake_case, tables au pluriel, ids `DEFAULT uuidv7()`, `created_at`/`updated_at`, colonne `version` pour `ExpectedVersion`.
- Web et API sur **la même origine** derrière Caddy (`/`, `/rpc`, `/api`) ; cookies `lax`, pas de CORS.

### Contrat oRPC ([#12](https://github.com/0xdaydy/systalink-challenge/issues/12), [#19](https://github.com/0xdaydy/systalink-challenge/issues/19))

- **oRPC v2 bêta épinglée `2.0.0-beta.41`** (sans `^`) ; `orpc-mcp` 0.1.3 avec le patch Bun versionné.
- `@codesphere/contract` : `base.ts` + un contrat par domaine ; `packages/api` implémente avec `implement(contract)`.
- **Erreurs** : `BAD_REQUEST` (validation, `issues` en `data` — remplace `UNPROCESSABLE_CONTENT`), `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `TOO_MANY_REQUESTS` (`retryAfter`) ; statut via `errorStatusMap` ; message anglais, traduction côté UI par code. Erreur inattendue → `INTERNAL_SERVER_ERROR` sans détail, avec `requestId`.
- **Pagination** : curseur opaque, `limit` 1..50 (20 par défaut), `Page(item)` = `{ items, nextCursor }`.
- **Builders** : `public`, `authed` (humain ou agent), `human` (voter, gérer ses agents), `admin`.
- **Exposition** : RPC `/rpc` pour le web ; OpenAPI `/api/v1` ; MCP `/mcp` pour les procédures annotées `mcp.tool` ; instantané du schéma OpenAPI testé.
- **Local-first** : `IdempotencyKey` sur toute création, `ExpectedVersion` sur toute édition (décalage → `CONFLICT`).
- Procédures clés : `questions.list` (filtres `tags`, `language`, `country`, `status`, `sort: hot | recent | unanswered`), `questions.get/create/update/close/delete`, `answers.create/update/delete/accept`, `votes.cast/retract`, `tags.search/follow/unfollow`, `feed.forYou` (humains), `hackathons.list/get`, `members.me/update/export/delete`, `agents.create/list/disable/delete/rotateKey`, `health`.

### Authentification ([#13](https://github.com/0xdaydy/systalink-challenge/issues/13))

- **SSO en production** (GitHub, GitLab, Google ; Bitbucket en bonus via OAuth générique) ; **retirer email/mot de passe** du scaffold. Scopes minimaux ; liaison de comptes sur email vérifié seulement ; jetons OAuth non conservés.
- **Code à usage unique par email (OTP), hors production uniquement** : en local et sur les previews, les fournisseurs SSO ne peuvent pas rappeler l'application. Le Member saisit son email et reçoit un code à 6 chiffres (valable 5 min) qu'il valide ; pas de mot de passe. Activé par `EMAIL_OTP_SIGNIN` (serveur) et `NEXT_PUBLIC_EMAIL_OTP_SIGNIN` (web), **désactivé en production**. Même consentement, même création de compte et même rôle (`ADMIN_EMAILS`) que le SSO ; email vérifié par le code. En développement, le code est aussi écrit dans le journal du serveur (jamais l'adresse).
- **Consentement** explicite au premier SSO (case non cochée, date et version enregistrées).
- **Agents** : `user` avec `kind: agent` et `ownerId` ; presets **lecture seule** / **contribuer** ; 3 max par humain ; clé `cs_live_…` hachée, affichée une fois, régénérable ; `Authorization: Bearer` ou `x-api-key` ; badge « Nom, agent de @owner » ; désactivation/suppression par l'Owner ; agents désactivés à la suppression de l'Owner.
- **Limites** : 120 req/min par clé ; 10 Questions/h et 30 Answers/h par Member (`@orpc/ratelimit`, mémoire) ; une clé limitée doit renvoyer **429**, pas 401 (piège du spike : middleware sur `verifyApiKey`).
  - **Portée du compteur mémoire** : un compteur par processus, remis à zéro au redémarrage ; sur Workers, chaque isolat compte pour lui-même. Conforme au MVP, mais pas une protection anti-abus stricte. Si le besoin devient réel, passer à un magasin partagé (Redis, Upstash) en remplaçant les limiteurs de `packages/api/src/rate-limit.ts`, sans toucher aux appelants.
- Scopes de clé appliqués dans un middleware oRPC.

### Flux ([#15](https://github.com/0xdaydy/systalink-challenge/issues/15))

- Onglets **Pour toi** / **Récents** / **Sans réponse** ; Questions seulement ; carte CADEV épinglée pendant le concours.
- Score chaud `(Score + 1) / (âge_h + 2)^1.5` en SQL, limité aux Tags suivis ; curseur avec `snapshotAt` + dernier `(score_chaud, id)`. Sans Tag suivi : Questions les plus chaudes de tous.
- Onboarding : au moins 3 Tags (passable). fr + en par défaut, filtres langue et pays facultatifs, pas de boost pays.
- Contenu d'agent badgé, masquable (réglage désactivé par défaut), jamais promu au-dessus d'un humain.

### Local-first ([#14](https://github.com/0xdaydy/systalink-challenge/issues/14))

- Cache TanStack Query persisté dans IndexedDB (`idb-keyval`), client seulement, liste blanche (2 premières pages du flux, Questions/Answers ouvertes, CADEV, Tags suivis, profil), 7 jours, `buster` = version du contrat.
- **Outbox** IndexedDB : poser, répondre, voter, suivre un Tag, accepter. Édition et suppression : en ligne seulement. États : brouillon → en attente → envoi → envoyé / rejeté (raison).
- Erreur réseau → backoff ; `FORBIDDEN`/`NOT_FOUND`/`CONFLICT`/`BAD_REQUEST` → rejeté, corrigeable ; 429 → après `retryAfter` ; > 30 jours → abandonné avec avertissement.
- Données locales rangées par Member, **effacées à la déconnexion** ; ni clé ni session en local ; `navigator.storage.persist()`.

### Interface ([#17](https://github.com/0xdaydy/systalink-challenge/issues/17))

Maquette de référence dans le ticket. Palette **Latérite** (`#a8432a` / `#d68a1f`, clair et sombre), **Outfit** + **JetBrains Mono**, preset shadcn `b3Z4yEG3lo`.

- Accueil « Fil de cartes » (bandeau hackathon, Tags suivis, carte d'agent en pointillés ; états vide, onboarding, hors-ligne).
- Question « solution d'abord », deux colonnes sur grand écran ; carte de réponse avec plateau d'actions et liseré de statut.
- Formulaire de réponse Écrire/Aperçu (volet en bas sur mobile) ; formulaire de question en étapes avec questions proches (conversation sur mobile).
- Hackathon en onglets (Aperçu, Frise, Prix, Règles, Jugement, Discussion) ; profil « réglages d'abord » (Profil public, Tags, Mes agents, Préférences, Confidentialité).

## 4. Sécurité et conformité ([carte #20](https://github.com/0xdaydy/systalink-challenge/issues/20))

- **Markdown** : sans HTML brut, rendu et assaini côté serveur à l'enregistrement (HTML stocké à côté de la source), coloration à l'enregistrement, liens `nofollow noopener`, pas d'images externes ([#25](https://github.com/0xdaydy/systalink-challenge/issues/25), [#26](https://github.com/0xdaydy/systalink-challenge/issues/26)).
- **En-têtes Caddy** : HSTS, CSP stricte avec nonce pour le SSR (nonce généré par le proxy Next.js), `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`.
- **Agents** : contenu renvoyé comme données balisées ; droits minimaux ; rappel dans les descriptions d'outils MCP.
- **Logs** : redaction, ni email ni corps de requête, IP tronquée, 14 jours ; **journal d'audit** (clés, suspensions, suppressions de compte).
- **Données personnelles** ([#23](https://github.com/0xdaydy/systalink-challenge/issues/23), [#24](https://github.com/0xdaydy/systalink-challenge/issues/24)) : email jamais public ; sessions 30 jours ; clés révoquées purgées après 30 jours ; **export JSON** immédiat ; **suppression** avec anonymisation ou effacement ; pages légales FR + EN (CGU, confidentialité, mentions, contact sous 30 jours) ; aucun analytics ni cookie non nécessaire.
- **Docker** : multi-étapes, non root ; Postgres non exposé.
- **Tests de sécurité obligatoires** ([#27](https://github.com/0xdaydy/systalink-challenge/issues/27)) : XSS Markdown, droits, 429, idempotence, export, suppression de compte. Grille `docs/security/owasp-checklist.md` et checklist serveur avant le 24 oct.
- **Actions humaines** : déclaration CDP Sénégal, conditions de traitement Systalink.

## 5. Livraison ([carte #28](https://github.com/0xdaydy/systalink-challenge/issues/28))

- **Environnements** : local (`docker-compose.yml`) ; `staging.codesphereplatform.xyz` et `codesphereplatform.xyz` sur le même Cloud Server, Caddy partagé (squelette : PR #36).
- **Pipeline** : `main` → build CI → GHCR (SHA) → SSH : pull, sauvegarde, migration éphémère, `up --wait`, `/ready`, Playwright en préproduction. Production = étiquette `vX.Y.Z` + Release GitHub. Retour arrière = étiquette précédente. Migrations additives uniquement.
- **Branches** : trunk-based, `feat|fix/<n°>-<slug>`, Conventional Commits en anglais, squash + `Closes #n`, PR + CI verte + **1 relecture humaine**. Gel à partir du 24 oct. au soir : `fix/*` seulement, sur décision du capitaine.
- **Tests** : unitaires, intégration sur Postgres réel, contrat OpenAPI, 3 parcours Playwright ; push = lint/types/unitaires ; PR = + intégration, contrat, gitleaks, licences, vulnérabilités ; chaque procédure a au moins un test (nominal + erreur typée) ; seed de test déterministe.
- **Versions** : SemVer, `v1.0.0` = soumission ; version + SHA dans `/health` et le pied de page.
- **Supervision** : UptimeRobot sur `/health`, Telegram + e-mail, rotation des logs, `cron` disque/mémoire, sauvegarde nocturne 7 jours + copie chiffrée R2 + heartbeat healthchecks.io ; restauration testée le 24 oct.
- **Équipe** ([#38](https://github.com/0xdaydy/systalink-challenge/issues/38)) : 4 membres. Capitaine @0xdaydy (backend, API, base de données) ; @Justice-47 et @Strong-Ari (frontend) ; @lamafx (QA / tests, documentation et dossier CADEV, suppléant CI/CD, déploiement et infra) ; production/SSH/secrets/astreinte = capitaine + @lamafx.

## 6. Livrables de dépôt

Projet déployé sur Systalink ; déclaration d'usage de l'IA (Claude Code) ; liste des composants tiers et licences (générée par la CI) ; politique de confidentialité publiée ; déclaration d'auteur par membre ; vidéo/pitch selon le formulaire (non publié). Préparés par le membre « doc », semaine du 25 oct. À l'inscription Datacloud (étape distincte du dépôt) : pays de représentation de l'équipe, **définitif** (art. 4), représentant unique et clé de répartition du prix.

## 7. Hors MVP

Langues africaines dans l'UI, modération complète, réputation et badges, notifications push, recherche plein texte avancée, paiements, apps natives, commentaires, historique de révisions, doublons, alias de Tags, soumissions de projets et autres hackathons, suivi d'erreurs (Sentry), CDN, prévisualisation par PR, Kubernetes.

## 8. Points ouverts (non bloquants)

- Liste finale des Tags locaux de départ (équipe, pour le seed).
- Contenu de démarrage pour la démo (questions d'amorçage).
- Bibliothèque i18n et organisation des traductions.
- Outils MCP exposés au-delà de la lecture et des écritures de base ; test avec de vrais clients (Claude Desktop, Cursor).
- Formulaire de dépôt CADEV et jury (non publiés).

## 9. Découpage en tickets 

Tranches verticales, dans l'ordre du calendrier. Chaque ticket : branche `feat/<n°>-…`, tests d'intégration de ses procédures, relecture humaine.

| Issue | Ticket | Période | Responsable |
|---|---|---|---|
| #40 | Fondations : retirer email/mot de passe, `BAD_REQUEST` dans `base.ts`, `@codesphere/logger`, `/health` + `/ready` (version, SHA), seed (CADEV, Tags), CI complète (gitleaks, licences, vulnérabilités) | 9–12 oct. | capitaine |
| #41 | Premier déploiement en **preview** (`develop` : web Vercel + API Workers) + supervision ; déploiement Systalink depuis `main` une fois serveur, web et domaine achetés (ticket #35) | 9–13 oct. | capitaine + lamafx |
| #42 | Thème Latérite, preset shadcn, mise en page, i18n de base, pied de page | 9–13 oct. | Justice-47 |
| #43 | SSO GitHub/GitLab/Google + consentement + profil (Region, ville privée) | 13–15 oct. | capitaine + Justice-47 |
| #44 | Tags : recherche, suivi, onboarding 3 Tags | 13–15 oct. | capitaine + Justice-47 |
| #45 | Page Hackathon CADEV (onglets, frise, compte à rebours, Questions du Tag) | 13–15 oct. | Justice-47 |
| #46 | Flux : `questions.list` filtrable, `feed.forYou` score chaud, 3 onglets, carte CADEV | 14–16 oct. | capitaine + Justice-47 |
| #47 | Poser une Question (étapes, Markdown assaini, questions proches) + page Question | 14–17 oct. | capitaine + Strong-Ari |
| #48 | Répondre, accepter, voter (règles, limites d'écriture, idempotence) | 16–19 oct. | capitaine + Strong-Ari |
| #49 | Hors-ligne : cache persisté + outbox et brouillons + indicateurs d'état | 18–21 oct. | Strong-Ari + capitaine |
| #50 | Agents : création, presets, clés `cs_live_`, scopes, 429, badge, masquage | 17–19 oct. | capitaine + Justice-47 |
| #51 | API `/api/v1` + MCP (outils, descriptions, instantané OpenAPI, test client réel) | 19–21 oct. | capitaine |
| #52 | Admin : fermer une Question, suspendre un Member, journal d'audit | 20–21 oct. | capitaine |
| #53 | Confidentialité : export JSON, suppression de compte, effacement local | 20–22 oct. | capitaine |
| #54 | Sécurité : en-têtes + CSP nonce, grille OWASP, checklist serveur | 20–23 oct. | lamafx |
| #55 | Tests de bout en bout : 3 parcours Playwright + seed de test | au fil de l'eau, fin 21 oct. | lamafx |
| #56 | Pages légales FR/EN, traduction complète | 18–22 oct. | lamafx + frontend |
| #57 | Contenu de démo (questions d'amorçage, agent de démo) + répétition générale | 21–23 oct. | lamafx + capitaine |
| #58 | Dossier de dépôt CADEV (déclarations, licences, vidéo/pitch) + `v1.0.0` | 15–25 oct. ; dépôt le 25 | lamafx |
