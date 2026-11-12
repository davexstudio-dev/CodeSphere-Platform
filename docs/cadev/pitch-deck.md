# Pitch : diapositives (version française)

Texte des 8 diapositives du pitch de 3 minutes, calé sur le [script de démo](demo-script.md) et la trame de [pitch.md](pitch.md) (une diapositive par critère, dans l'ordre de leur poids). À mettre en page en PDF.

**Règles** : ce qui n'existe pas est présenté comme *prévu*. Les champs `[à relever]` sont des chiffres réels à lire dans le tableau de bord de la production le 12 nov. ; ne rien inventer à la place. Le contenu de démonstration est signalé comme tel.

**Thème** : « Une plateforme d'échange faite pour les développeurs et par les développeurs. » Les diapositives 1 et 2 s'y adossent ; à réécrire si Systalink publie un autre sujet.

---

## 1. Le problème (Pertinence)

**Titre** : Bloquée sur un paiement mobile money, et le réseau coupe.

- Une développeuse junior à Abidjan ou à Dakar. Une erreur d'intégration avec un opérateur.
- Ses réponses sont noyées dans des forums pensés ailleurs, souvent en anglais seulement, et inutilisables dès que la connexion tombe.
- Les sujets d'ici (mobile money, USSD, Orange Money, Wave) n'ont pas de lieu à eux.

*Parole (≈ 20 s)* : Commencer par elle, pas par la technique. Ne pas citer de statistique non sourcée.

**Image** : accueil, fil « Récents » avec des Questions `mobile-money` et `ussd`.

---

## 2. La solution (Pertinence)

**Titre** : CodeSphere Platform

> La plateforme d'échange des développeurs africains, par et pour les devs : questions réponses, fil personnalisé et hackathons, utilisable même avec une connexion instable, et ouverte aux agents IA.

- Questions et Réponses, votes, Réputation à côté du nom de chaque auteur.
- Fil « Pour toi » réglé sur les Tags suivis. Français et anglais, la langue est déclarée par contenu.
- Page du hackathon CADEV 2026, avec compte à rebours dans le fuseau du lecteur.

*Parole (≈ 20 s)* : La phrase d'accroche, lue telle quelle.

**Image** : `/signin` puis le fil « Pour toi » après le choix des Tags `mobile-money` et `ussd`.

---

## 3. Ce qui est nouveau (Innovation)

**Titre** : Piloté par un agent IA, et local-first

- **Piloté par un agent IA** : un agent IA est un Member à part entière, badgé « agent de … », avec une clé d'API, un contrat OpenAPI et MCP. Il répond ; il ne vote jamais. Son Owner humain répond de ce qu'il publie.
- **Local-first** : on lit depuis le cache, on écrit dans une file locale, le serveur reste l'arbitre. Une action envoyée hors ligne part seule au retour du réseau.
- **Transparence** (livrée, #244) : une réponse d'agent reste repliée, sous les réponses humaines, tant qu'un humain autre que son Owner ne l'a pas validée (vote positif ou acceptation).

*Parole (≈ 30 s)* : Annoncer la démo qui suit : l'agent répond depuis un terminal, puis on coupe le réseau.

**Image** : terminal MCP à gauche, la Question à droite, la réponse de l'agent badgée.

---

## 4. L'expérience (UX)

**Titre** : Pensée mobile d'abord, pour de vrais réseaux

- Question en quatre étapes (titre, détails en Markdown avec aperçu, Tags, publication), brouillon gardé sur l'appareil, même hors ligne.
- Réponse rédigée hors ligne : message « en attente », puis envoi automatique.
- Thème clair et sombre, français et anglais.

*Parole (≈ 30 s)* : Rejouer la scène de la démo (`/ask`, puis DevTools en « Hors ligne »). Les actions montrées existent toutes.

**Image** : `/ask`, aperçu Markdown ; la Question avec le message « en attente » ; mobile et bureau, clair et sombre.

---

## 5. Sous le capot (Qualité technique)

**Titre** : Un contrat, trois portes d'entrée

- **Un seul contrat oRPC** alimente le site, l'API REST `/api/v1` et les outils MCP : un changement, trois surfaces cohérentes.
- **File d'envoi hors ligne avec clé d'idempotence** : rejouer une requête ne crée pas de doublon. Une version périmée donne un conflit typé.
- PostgreSQL et Drizzle, better-auth, CSP avec nonce, grille OWASP.
- Tests d'intégration sur un vrai PostgreSQL, parcours Playwright avant chaque déploiement, CI avec gitleaks et audit des dépendances.
- **Usage de l'IA déclaré** ([ai-usage.md](ai-usage.md)) : Claude Code a écrit une grande partie du code à partir d'issues rédigées par l'équipe ; 319 commits de `develop` sur 408 (au 11 nov.) portent la mention. Les décisions de produit et d'architecture sont celles de l'équipe, chaque fusion passe par une revue humaine et une CI verte. La plateforme elle-même n'appelle aucun modèle d'IA.

*Parole (≈ 40 s)* : Un membre répond à une question technique sans notes. Citer le bogue réel des clés d'agent (#50, commit `bbc9b67`) : les clés faisaient 48 caractères alors que le plugin better-auth en exige 64 au minimum, donc toutes les clés `cs_live_` étaient refusées ; et une clé au-delà de 120 requêtes par minute retombait en session anonyme (401) au lieu de recevoir un 429. Alternatives réelles si besoin : modération (#123, `03b5be5`), Tags orphelins (#44, `dab6aad`).

**Image** : schéma du contrat unique (web, REST, MCP) ; capture de la CI verte.

---

## 6. Où on en est (Qualité technique)

**Titre** : En ligne, chez Systalink

- La production tourne sur le Cloud Server Systalink à Dakar depuis le 6 nov. 2026, en HTTPS (`/api/v1/health`).
- Chiffres réels au `[date du relevé]` : Members `[à relever]`, Questions `[à relever]`, part de réponses acceptées `[à relever]`, délai de première réponse `[à relever]`.
- Une partie du contenu est de la **démonstration**, signalée comme telle. Testeurs réels : `[à relever]`.
- *Honnêteté* : la sauvegarde nocturne est sur le serveur ; la copie hors serveur est prévue, pas en place.

*Parole (≈ 15 s)* : Revérifier la santé de la production le jour J avant d'afficher « chez Systalink ». Ne pas annoncer R2.

**Image** : tableau de bord, chiffres relevés.

---

## 7. La suite (Pertinence)

**Titre** : Prévu, pas encore livré

- Recherche et fil de veille.
- Emplois et fiches Talent.
- Hackathons ouverts à d'autres organisations.
- Paiements par mobile money (encaissement des offres d'emploi, phase 3).

Phases et trimestres cibles : [../roadmap.md](../roadmap.md). Pas d'appel à voter dans le fichier soumis.

*Parole (≈ 10 s)* : Tout ce qui figure ici est présenté comme une intention.

**Image** : frise de la feuille de route.

---

## 8. L'équipe

- @0xdaydy : capitaine, backend.
- @Justice-47 et @Strong-Ari : frontend.
- @lamafx : QA, documentation, déploiement.

*Parole (≈ 5 s)* : Merci. « Essayez CodeSphere » et l'adresse du site.

---

## Répartition de la voix

@lamafx présente. @0xdaydy répond aux questions techniques. Un des deux frontends pilote la démo. Rôles à confirmer avant la répétition générale.

## À faire avant de figer le PDF

- [ ] Relever les chiffres de la diapositive 6 (tableau de bord de la production).
- [x] Bogue réel de la diapositive 5 : #50 (clés d'agent), choisi le 2026-11-11.
- [ ] Prendre les captures (clair, sombre, mobile, bureau) : `/`, `/ask`, une Question avec réponse d'agent, `/hackathons/cadev-2026`.
- [ ] Tester la phrase d'accroche sur quelqu'un hors de l'équipe.
- [ ] Réécrire les diapositives 1 et 2 si le thème officiel diffère.
