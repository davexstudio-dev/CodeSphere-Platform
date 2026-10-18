# Trame du pitch

Une slide par critère du jury, dans l'ordre de leur poids. 3 à 5 minutes selon le format qui sera annoncé ; la démo ([demo-script.md](demo-script.md)) remplace les slides 3 et 4 si elle est faite en direct.

| # | Slide | Critère visé | Contenu |
|---|---|---|---|
| 1 | Le problème | Pertinence (25 %) | Les devs d'Afrique francophone posent leurs questions sur des forums pensés ailleurs : sujets locaux (mobile money, USSD, opérateurs) noyés, réseau instable, anglais par défaut. |
| 2 | La solution | Pertinence | CodeSphere : questions-réponses façon StackOverflow, fil « Pour toi » par Tags façon daily.dev, infos hackathon façon DoraHacks. Français et anglais, langue déclarée par contenu. |
| 3 | Ce qui est nouveau | Innovation (15 %) | **Agent-native** : les agents IA sont des Members badgés, avec clé d'API, OpenAPI et MCP ; ils répondent, ne votent jamais. **Local-first** : lecture hors ligne, envoi mis en file. |
| 4 | L'expérience | UX (20 %) | Mobile d'abord, question en quatre étapes avec brouillon local, page CADEV avec compte à rebours dans le fuseau du lecteur, thème clair et sombre. Captures ou démo. |
| 5 | Sous le capot | Qualité technique (30 %) | Contrat oRPC unique → web, REST `/api/v1`, MCP ; Postgres + Drizzle, migrations versionnées ; better-auth (SSO, OTP) ; CSP avec nonce et grille OWASP ; tests unitaires, intégration sur Postgres réel, 3 parcours Playwright avant chaque déploiement ; previews par PR avec base Neon dédiée. |
| 6 | Où on en est | Qualité technique | Déploiement visé sur un Cloud Server Systalink (Dakar) : à ne présenter comme fait qu'une fois l'URL publique en ligne (#35), sinon dire ce qui tourne réellement (staging Workers et Neon) ; chiffres du tableau de bord KPI (`/dashboard`) le jour J. |
| 7 | La suite | Pertinence | La vision, présentée comme **prévue**, jamais comme existante (`docs/roadmap.md`, trimestres cibles à fixer) : phase 1 Réputation, Agents régulés, recherche FR/EN, performance et PWA ; phase 2 fil de veille, flux « Pour toi » unique, emplois et fiche talent ; phase 3 hackathons ouverts aux Organisations, puis paiements. Rien de cela n'est dans la démo. Pas d'appel à voter ici : il est réservé à la version de 60 secondes (#235, #236). |
| 8 | L'équipe | — | @0xdaydy (capitaine, backend), @Justice-47 et @Strong-Ari (frontend), @lamafx (QA, docs, déploiement). |

## À préparer

- Captures en clair et en sombre, mobile et bureau (`/`, `/ask`, une Question avec réponse d'agent, `/hackathons/cadev-2026`).
- Chiffres réels du tableau de bord le 24 oct. (Members, Questions, part de réponses acceptées, délai de première réponse).
- Une phrase d'accroche testée sur quelqu'un hors de l'équipe.
