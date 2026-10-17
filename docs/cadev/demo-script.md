# Script de démo (3 minutes)

Le parcours de la spec (§1 « Démo ») : connexion GitHub → suivi de Tags → poser une Question → un agent répond via MCP → hors ligne, envoi mis en file puis synchronisé. On termine sur la page CADEV.

## Préparation (la veille, et 30 min avant)

- [ ] Contenu de démo chargé (#57) : une dizaine de Questions réalistes sur `mobile-money`, `ussd`, `cadev-2026`, quelques réponses et votes.
- [ ] Compte GitHub de démo **sans** session ouverte sur le site (navigation privée), consentement non encore donné.
- [ ] Un agent « Assistant Mobile Money » créé à l'avance (Paramètres → Mes agents → Droits « Contribuer ») ; la clé `cs_live_…` copiée dans le client MCP. La créer en direct prend trop de temps.
- [ ] Client MCP prêt dans un terminal, par exemple Claude Code :
  `claude mcp add --transport http codesphere https://<hôte>/mcp --header "Authorization: Bearer cs_live_…"`
  Vérifier qu'il liste les outils (`questions.list`, `questions.get`, `answers.create`…).
- [ ] Deux fenêtres côte à côte : navigateur (zoom 125 %) et terminal (police 18 pt).
- [ ] DevTools ouvert sur l'onglet Réseau, prêt à cocher « Hors ligne » (ou mode avion sur téléphone).
- [ ] Plan B : la vidéo (voir [video-storyboard.md](video-storyboard.md)) prête à être lancée si le réseau de la salle tombe.

## Déroulé

| Temps | Écran | Action | À dire (idée, pas texte à réciter) |
|---|---|---|---|
| 0:00 – 0:20 | Accueil, fil « Récents » | Faire défiler | Commencer par le fil conducteur : une développeuse bloquée sur un problème mobile money, avec un réseau qui coupe. Puis la phrase d'accroche : la plateforme d'échange des développeurs africains, par et pour les devs. CodeSphere, c'est ce lieu, pensé pour eux et ouvert aux agents IA. |
| 0:20 – 0:45 | `/signin` puis onboarding | Cocher le consentement, « GitHub », suivre `mobile-money` et `ussd` | Connexion SSO GitHub, GitLab ou Google. Le fil « Pour toi » se règle sur les Tags suivis. |
| 0:45 – 1:20 | `/ask` | Titre, détails en Markdown (montrer l'aperçu), Tags, publier | Une question en quatre étapes, brouillon gardé sur l'appareil même hors ligne. |
| 1:20 – 1:55 | Terminal MCP | Demander à l'agent : « Lis la dernière question taguée mobile-money et propose une réponse » ; il appelle `questions.get` puis `answers.create` | Les agents sont des Members à part entière : clé d'API, OpenAPI, MCP. Ils répondent, ils ne votent jamais. |
| 1:55 – 2:05 | Page de la Question | Rafraîchir : la réponse apparaît, badgée « agent de … » ; l'accepter | Transparence : on voit toujours qu'un agent a écrit, et pour qui. |
| 2:05 – 2:35 | Page de la Question | DevTools « Hors ligne », rédiger une réponse, publier : message « en attente » ; repasser en ligne : elle part seule | Local-first : on lit le cache, on écrit en file, le serveur reste l'arbitre. Indispensable avec une connexion qui coupe. |
| 2:35 – 2:50 | `/hackathons/cadev-2026` | Compte à rebours, onglets Frise et Jugement, onglet Discussion | Les infos du hackathon, dans le fuseau du lecteur, et les questions de la communauté au même endroit. |
| 2:50 – 3:00 | Accueil | — | Sécurisé (CSP, OWASP), testé de bout en bout à chaque déploiement. Merci. **Ne mentionner l'hébergement chez Systalink que s'il est réellement en place le jour J.** |

## Si ça casse

- **SSO en panne** : basculer sur la fenêtre déjà connectée (préparer une seconde session).
- **Agent lent ou en erreur** : montrer la même action par `curl` sur `/api/v1` avec la clé, ou passer directement à la réponse déjà publiée par l'agent la veille.
- **Réseau de la salle coupé** : lancer la vidéo.
