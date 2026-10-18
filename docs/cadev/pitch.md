# Stratégie et trame du pitch

Décisions issues du ticket « Stratégie du pitch CADEV » (#235 de la carte #218). Le règlement public ne mentionne ni pitch en direct, ni durée, ni format : **le dossier de soumission est le pitch** (texte de présentation, README, diapositives en PDF, vidéo). La version orale de 3 minutes en est une pièce, prête si une présentation est annoncée.

## Phrase d'accroche et thème

> La plateforme d'échange des développeurs africains, par et pour les devs : questions réponses, fil personnalisé et hackathons, utilisable même avec une connexion instable, et ouverte aux agents IA.

Thème retenu (communiqué par l'équipe, non trouvé dans les sources publiques de Systalink à ce jour) : **« La plateforme d'échange des développeurs africains, par et pour les devs »**. Les deux premières diapositives s'y adossent et sont à réécrire si Systalink publie un sujet différent. Une personne surveille la page de Systalink chaque jour.

## Principes

- **Un fil conducteur** : une développeuse junior à Abidjan ou Dakar, un réseau qui coupe, bloquée sur une erreur d'intégration mobile money. Chaque fonctionnalité n'apparaît que parce qu'elle lui sert.
- **Un seul pilier démontré** : la Q&R agent-native et hors-ligne. Le fil et les hackathons se disent dans la phrase d'accroche et dans « La suite ».
- **Vision et réalité séparées** : ce qui n'existe pas est présenté comme **prévu**, jamais montré dans la démo ni décrit comme livré.
- **Rien d'affirmé qui ne soit vrai le jour J** : en particulier l'hébergement (voir la diapositive 6).
- **Les 30 premières secondes comptent** : le vote entre pairs est obligatoire et chaque pair voit jusqu'à 10 projets tirés au hasard. La page du projet dit, sans défilement, qui il aide, quel problème il résout et en quoi il diffère (une phrase, une capture, un bouton « Essayer »).

## Trame (une diapositive par critère, dans l'ordre de leur poids)

| # | Diapositive | Critère visé | Contenu |
|---|---|---|---|
| 1 | Le problème | Pertinence (25 %) | La développeuse du fil conducteur : ses questions sur mobile money, USSD et opérateurs sont noyées dans des forums pensés ailleurs, le réseau coupe, tout est en anglais par défaut. Adossée au thème. |
| 2 | La solution | Pertinence | La phrase d'accroche. Q&R façon StackOverflow, fil « Pour toi » par Tags, page CADEV. Français et anglais, langue déclarée par contenu. |
| 3 | Ce qui est nouveau | Innovation (15 %) | **Agent-native** : les agents IA sont des Members badgés, avec clé d'API, OpenAPI et MCP ; ils répondent, ne votent jamais, et leurs réponses restent repliées tant qu'un humain ne les a pas validées (prévu). **Local-first** : lecture hors ligne, envoi mis en file. |
| 4 | L'expérience | UX (20 %) | Mobile d'abord, question en quatre étapes avec brouillon local, page CADEV avec compte à rebours dans le fuseau du lecteur, thème clair et sombre. Captures ou démo. |
| 5 | Sous le capot | Qualité technique (30 %) | Deux décisions expliquées : le contrat oRPC unique qui alimente le web, REST `/api/v1` et MCP ; la file d'envoi hors-ligne avec clé d'idempotence. Un bogue réel trouvé et corrigé. Postgres + Drizzle, better-auth, CSP avec nonce et grille OWASP, tests d'intégration sur Postgres réel, 3 parcours Playwright avant chaque déploiement. **Usage de l'IA déclaré honnêtement** ([ai-usage.md](ai-usage.md)) : ce que l'IA a fait, ce que l'équipe a décidé, comment c'est vérifié. Un membre répond à une question technique sans notes. |
| 6 | Où on en est | Qualité technique | Chiffres réels du tableau de bord le 24 oct. (contenu de démonstration signalé comme tel, vingt testeurs réels). **Hébergement : à écrire selon l'état réel du déploiement sur Datacloud ; ne pas écrire « hébergé chez Systalink » tant que ce n'est pas fait.** |
| 7 | La suite | Pertinence | Présentée comme **prévue** : Réputation, recherche, fil de veille, emplois, hackathons ouverts, paiements par mobile money. Phases et trimestres cibles dans [../roadmap.md](../roadmap.md). Pas d'appel à voter dans le fichier soumis. |
| 8 | L'équipe | — | @0xdaydy (capitaine, backend), @Justice-47 et @Strong-Ari (frontend), @lamafx (QA, docs, déploiement). |

## Voix et versions

- **Voix** : @lamafx présente, @0xdaydy répond aux questions techniques, un des deux frontends pilote la démo. Rôles fixés avant la répétition du 23 oct.
- **Version maîtresse de 3 minutes** : celle ci-dessus.
- **Version de 60 secondes** pour les réseaux et le vote public : le problème, la démo en une scène, l'appel à voter (ajouté le 27 oct. avec le vrai lien). Même histoire, mêmes mots clés.

## Calendrier (cible interne)

18 oct. pitch v1 · 20 oct. tournage complet de secours · 22 oct. au soir gel des fonctionnalités · 23 oct. retournage ciblé, montage final, répétition générale · 24 oct. soumission · limite 25 oct. 17h00 GMT.

## À préparer

- Captures en clair et en sombre, mobile et bureau (`/`, `/ask`, une Question avec réponse d'agent, `/hackathons/cadev-2026`).
- Chiffres réels du tableau de bord le 24 oct. (Members, Questions, part de réponses acceptées, délai de première réponse).
- La phrase d'accroche testée sur quelqu'un hors de l'équipe.
- Les questions à poser à cadev@systalink.com avant le 22 oct. : transfert des droits du gagnant (l'article a disparu du règlement), format attendu du pitch et de la vidéo, adresse et modalités du vote public.
