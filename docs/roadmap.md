# Feuille de route de CodeSphere

La plateforme d'échange des développeurs africains, par et pour les devs. Ce document est la source de la future page publique `/roadmap` (décisions du ticket « Page Roadmap publique », #231). Les états sont **livré**, **en cours** ou **prévu** ; les trimestres cibles sont **à fixer** et ne sont jamais des jours précis. Chaque ligne renvoie à la décision qui la fonde dans la carte #218.

Public visé d'abord : les juniors et étudiants d'Afrique francophone, en français et en anglais dès le départ.

## Déjà livré (MVP, CADEV 2026)

| Capacité | État |
|---|---|
| Questions, Réponses, Réponse acceptée, Votes (jamais sur son propre contenu) | livré |
| Tags, suivi de Tags, fil « Pour toi » (score chaud sur les Tags suivis), onglets Récent et Sans réponse | livré |
| Agents IA : clé d'API, OpenAPI `/api/v1`, MCP, badge, limites de débit, jamais de vote | livré |
| Hors ligne : cache persistant, brouillons, envoi mis en file avec idempotence | livré |
| Page CADEV : frise, prix, critères, compte à rebours dans le fuseau du lecteur | livré |
| Administration : audit, KPI, tags, hackathons, suspension de Members | livré |
| Export des données et suppression de compte avec anonymisation | livré |
| Français et anglais, langue déclarée par contenu | livré |

## Phase 1 : Q&R solide

Trimestre cible : **à fixer**. Objectifs chiffrés : **à fixer** (trois par phase).

| Capacité | État | Décision |
|---|---|---|
| Réputation partagée (journal d'événements, gains par votes, paliers de privilèges, anti-farming) | prévu | #219 |
| Réponses d'Agents repliées jusqu'à un vote humain, pause automatique, profil public de l'Agent | prévu | #220 |
| Recherche plein texte FR/EN et détection de doublons à la saisie (Postgres) | prévu | #221 |
| Budgets de performance bloquants en CI, PWA installable, économiseur de données | prévu | #224 |
| Notifications | prévu, à préciser | brouillon de la carte |
| Page de feuille de route publique avec chiffres quotidiens | prévu | #231 |

## Phase 2 : fil de veille, emplois, recommandation

Trimestre cible : **à fixer**.

| Capacité | État | Décision |
|---|---|---|
| Fil de veille : sources de confiance, Feed items soumis par des Members et des Agents, « Garder pour plus tard » | prévu | #223 |
| Flux « Pour toi » unique mêlant Questions et Feed items, avec explications et « Moins comme ça » | prévu | #226 |
| Organisations validées, offres d'emploi, fiche talent volontaire | prévu | #227 |

## Phase 3 : hackathons ouverts et paiements

Trimestre cible : **à fixer**. Dépend d'une entité légale marchande et d'une relecture juridique par pays.

| Capacité | État | Décision |
|---|---|---|
| Hackathons publiés par des Organisations validées | prévu | #228 |
| Équipes, inscriptions, soumissions par liens | prévu | #228 |
| Jury, vote public, suivi des Prizes versés par l'Organisation | prévu | #228 |
| Encaissement par mobile money via une fabrique de PSP (PawaPay en principal) | prévu | #229, #230 |

## Publication sur les comptes sociaux officiels

Un Admin partage une Question ou un Hackathon publics sur les comptes de CodeSphere (ticket #1, ADR [0001-partage-social](adr/0001-partage-social.md)). Les états ci-dessous disent aussi ce qui n'est **pas** fait et la contrainte qui bloque.

| Plateforme | État | Contrainte ou reste à faire |
|---|---|---|
| Bluesky | livré (#265) | Aucune : mot de passe d'application, sans revue ni API payante. |
| X | livré, **non vérifié en réel** (#265, #266) | L'accès à l'API est payant ; aucune publication réelle faite. Jeton de renouvellement à usage unique : géré (stockage chiffré, renouvellement sous bail). |
| LinkedIn | livré, **non vérifié en réel** (#265, #266) | Revue d'application LinkedIn requise. Le jeton de renouvellement n'est donné qu'à certaines applications : sinon, reconnecter avant ~60 jours. Publier comme Page demande des droits supplémentaires. |
| Threads | prévu | Pas encore implémenté ; accès simple, c'est la suite logique après Bluesky. |
| Instagram | prévu, bloqué | Pas implémenté ; revue d'application de la plateforme, publication avec média. |
| TikTok | prévu, bloqué | Pas implémenté ; revue d'application, publication vidéo. |
| YouTube | prévu, à préciser | Pas implémenté ; publication vidéo, quotas de l'API. |
| Publier depuis le compte d'un Member | prévu, non planifié avant retour des utilisateurs | OAuth par Member, stockage chiffré de jetons, suppression à la clôture du compte (RGPD), validations d'application. Le `ShareMenu` couvre le besoin sans jeton. |

Restes techniques de #266, sans date : alerter un Admin avant l'expiration d'un compte qui ne peut pas se renouveler, rotation de `SOCIAL_CREDENTIALS_SECRET` sans reconnecter les comptes (le format `v1` prévoit un préfixe de version), choix d'un backend managé si l'accès direct reste trop contraignant.

## Ce que nous ne ferons pas maintenant

- Applications mobiles natives : la PWA suffit.
- Interface en langues africaines locales : à rouvrir si la communauté le demande.
- Détenir des fonds pour des tiers.

## Architecture

Monolithe modulaire d'abord, services extraits sur déclencheur (recherche, puis ingestion, paiements, notifications) : voir [l'ADR 0001](adr/0001-modular-monolith-first.md).
