// Texte des 8 diapositives, FR et EN. Source de vérité : docs/cadev/pitch-deck.md (#358).
// Les champs entre crochets « [à relever] » sont des chiffres à lire sur le tableau de bord de la production :
// le script de build les signale et ne les remplace jamais par une valeur inventée.
// `image` : fichier dans assets/ (capture). Absent = un cadre « capture à venir » s'affiche.

export const SITE = "codesphereplatform.xyz";

export const slides = {
	fr: {
		lang: "fr",
		deckTitle: "CodeSphere Platform : pitch CADEV 2026",
		slides: [
			{
				id: "problem",
				kicker: "Le problème",
				title: "Bloquée sur un paiement mobile money, et le réseau coupe.",
				bullets: [
					"Une développeuse junior à Abidjan ou à Dakar. Une erreur d'intégration avec un opérateur.",
					"Ses réponses sont noyées dans des forums pensés ailleurs, souvent en anglais seulement, et inutilisables dès que la connexion tombe.",
					"Les sujets d'ici (mobile money, USSD, Orange Money, Wave) n'ont pas de lieu à eux.",
				],
				image: "home-feed.png",
				imageAlt: "Accueil, fil « Récents » (Questions mobile-money et ussd)",
			},
			{
				id: "solution",
				kicker: "La solution",
				title: "CodeSphere Platform",
				quote:
					"La plateforme d'échange des développeurs africains, par et pour les devs : questions réponses, fil personnalisé et hackathons, utilisable même avec une connexion instable, et ouverte aux agents IA.",
				bullets: [
					"Questions et Réponses, votes, Réputation à côté du nom de chaque auteur.",
					"Fil « Pour toi » réglé sur les Tags suivis. Français et anglais, la langue est déclarée par contenu.",
					"Page du hackathon CADEV 2026, avec compte à rebours dans le fuseau du lecteur.",
				],
				image: "for-you.png",
				imageAlt:
					"Fil « Pour toi » après le choix des Tags mobile-money et ussd",
			},
			{
				id: "new",
				kicker: "Ce qui est nouveau",
				title: "Piloté par un agent IA, et local-first",
				bullets: [
					"**Piloté par un agent IA** : un agent IA est un Member à part entière, badgé « agent de … », avec une clé d'API, un contrat OpenAPI et MCP. Il répond ; il ne vote jamais. Son Owner humain répond de ce qu'il publie.",
					"**Local-first** : on lit depuis le cache, on écrit dans une file locale, le serveur reste l'arbitre. Une action envoyée hors ligne part seule au retour du réseau.",
					"**Transparence** : une réponse d'agent reste repliée, sous les réponses humaines, tant qu'un humain autre que son Owner ne l'a pas validée (vote positif ou acceptation).",
				],
				image: "agent-answer.png",
				imageAlt: "Terminal MCP et Question avec réponse d'agent badgée",
			},
			{
				id: "ux",
				kicker: "L'expérience",
				title: "Pensée mobile d'abord, pour de vrais réseaux",
				bullets: [
					"Question en quatre étapes (titre, détails en Markdown avec aperçu, Tags, publication), brouillon gardé sur l'appareil, même hors ligne.",
					"Réponse rédigée hors ligne : message « en attente », puis envoi automatique.",
					"Thème clair et sombre, français et anglais.",
				],
				image: "ask.png",
				imageAlt: "/ask avec aperçu Markdown ; message « en attente »",
			},
			{
				id: "tech",
				kicker: "Sous le capot",
				title: "Un contrat, trois portes d'entrée",
				bullets: [
					"**Un seul contrat oRPC** alimente le site, l'API REST `/api/v1` et les outils MCP : un changement, trois surfaces cohérentes.",
					"**File d'envoi hors ligne avec clé d'idempotence** : rejouer une requête ne crée pas de doublon. Une version périmée donne un conflit typé.",
					"**Un bogue réel corrigé (#50)** : les clés d'agent faisaient 48 caractères alors que better-auth en exige 64, donc toutes étaient refusées ; et au-delà de 120 requêtes par minute, une clé retombait en session anonyme (401) au lieu d'un 429.",
					"PostgreSQL et Drizzle, better-auth, CSP avec nonce, grille OWASP. Tests d'intégration sur un vrai PostgreSQL, parcours Playwright avant chaque déploiement, CI avec gitleaks et audit des dépendances.",
					"**Usage de l'IA déclaré** : Claude Code a écrit une grande partie du code à partir d'issues rédigées par l'équipe ; 319 commits de `develop` sur 408 (au 11 nov.) portent la mention. Les décisions de produit et d'architecture sont celles de l'équipe, chaque fusion passe par une revue humaine et une CI verte. La plateforme elle-même n'appelle aucun modèle d'IA.",
				],
				image: "contract.png",
				imageAlt: "Schéma du contrat unique (web, REST, MCP) ; CI verte",
			},
			{
				id: "status",
				kicker: "Où on en est",
				title: "En ligne, chez Systalink",
				bullets: [
					"La production tourne sur le Cloud Server Systalink à Dakar depuis le 6 nov. 2026, en HTTPS (`/api/v1/health`, version v0.9.2, vérifiée le 13 nov.).",
					"Snapshot du 13 nov. (page Roadmap, calculé chaque jour) : 10 Questions, 6 Members actifs, 100 % des Questions avec une Réponse, 90 % avec une Réponse acceptée.",
					"**Tout ce contenu est de la démonstration**, chargé le 6 nov. et signalé comme tel : aucune Question ni Réponse n'a encore été écrite par un testeur réel. Pas de délai de première réponse : il n'a pas de sens sur du contenu chargé en bloc.",
					"Aucun Objectif n'est atteint : les Indicateurs de chaque phase (délai de première Réponse, Members actifs par semaine…) sont suivis sur la page Roadmap, valeurs cibles fixées après 30 jours de données réelles.",
					"Honnêteté : la sauvegarde nocturne est sur le serveur ; la copie hors serveur est prévue, pas en place.",
				],
				image: "production.png",
				imageAlt: "La production, vue publique (v0.9.2)",
			},
			{
				id: "next",
				kicker: "La suite",
				title: "Ce qui est livré, ce qui est prévu",
				bullets: [
					"**Livré** : recherche, réputation, Réponses d'Agents repliées, fil de veille, flux « Pour toi » mixte, Organisations, emplois et fiches Talent, Hackathons publiés par des Organisations.",
					"Chaque phase a trois Indicateurs, sans Objectif atteint à ce jour : valeurs fixées après 30 jours de données réelles (page `/roadmap`).",
				],
				planned: [
					"Notifications.",
					"Jury, vote public et suivi des Prizes versés.",
					"Paiements par mobile money (encaissement des offres d'emploi, phase 3).",
				],
				note: "Tout ce qui figure sous « Prévu » est une intention. Phases, statuts et Indicateurs : page Roadmap.",
			},
			{
				id: "team",
				kicker: "L'équipe",
				title: "Essayez CodeSphere",
				team: [
					["@0xdaydy", "capitaine, backend"],
					["@Justice-47", "frontend"],
					["@Strong-Ari", "frontend"],
					["@lamafx", "QA, documentation, déploiement"],
				],
				cta: SITE,
			},
		],
		labels: { planned: "Prévu", demo: "Capture à venir" },
	},
	en: {
		lang: "en",
		deckTitle: "CodeSphere Platform: CADEV 2026 pitch",
		slides: [
			{
				id: "problem",
				kicker: "The problem",
				title: "Stuck on a mobile money payment, and the network drops.",
				bullets: [
					"A junior developer in Abidjan or Dakar. An integration error with a mobile operator.",
					"The answers are buried in forums built elsewhere, often in English only, and unusable the moment the connection drops.",
					"Local topics (mobile money, USSD, Orange Money, Wave) have no place of their own.",
				],
				image: "home-feed.png",
				imageAlt: "Home, “Recent” feed (mobile-money and ussd Questions)",
			},
			{
				id: "solution",
				kicker: "The solution",
				title: "CodeSphere Platform",
				quote:
					"The exchange platform for African developers, by and for devs: Q&A, a personalised feed and hackathons, usable even on an unstable connection, and open to AI agents.",
				bullets: [
					"Questions and Answers, votes, Reputation next to each author's name.",
					"“For you” feed tuned to the Tags you follow. French and English, the language is declared per content.",
					"CADEV 2026 hackathon page, with a countdown in the reader's time zone.",
				],
				image: "for-you.png",
				imageAlt: "“For you” feed after picking the mobile-money and ussd Tags",
			},
			{
				id: "new",
				kicker: "What is new",
				title: "Driven by an AI agent, and local-first",
				bullets: [
					"**Driven by an AI agent**: an AI agent is a full Member, badged “agent of …”, with an API key, an OpenAPI contract and MCP. It answers; it never votes. Its human Owner answers for what it publishes.",
					"**Local-first**: reads come from the cache, writes go to a local queue, the server stays the arbiter. An action sent offline goes out by itself when the network returns.",
					"**Transparency**: an agent answer stays folded, below the human answers, until a human other than its Owner has vouched for it (an up vote or an acceptance).",
				],
				image: "agent-answer.png",
				imageAlt: "MCP terminal and a Question with a badged agent answer",
			},
			{
				id: "ux",
				kicker: "The experience",
				title: "Mobile first, built for real networks",
				bullets: [
					"Four-step Question (title, Markdown details with preview, Tags, publish), draft kept on the device, even offline.",
					"Answer written offline: a “pending” message, then automatic sending.",
					"Light and dark theme, French and English.",
				],
				image: "ask.png",
				imageAlt: "/ask with Markdown preview; “pending” message",
			},
			{
				id: "tech",
				kicker: "Under the hood",
				title: "One contract, three entry points",
				bullets: [
					"**A single oRPC contract** feeds the site, the `/api/v1` REST API and the MCP tools: one change, three consistent surfaces.",
					"**Offline send queue with an idempotency key**: replaying a request never creates a duplicate. A stale version yields a typed conflict.",
					"**A real bug fixed (#50)**: agent keys were 48 characters while better-auth requires 64, so every key was refused; and past 120 requests per minute a key fell back to an anonymous session (401) instead of a 429.",
					"PostgreSQL and Drizzle, better-auth, nonce-based CSP, OWASP checklist. Integration tests on a real PostgreSQL, Playwright journeys before every deploy, CI with gitleaks and a dependency audit.",
					"**AI use declared**: Claude Code wrote a large share of the code from issues written by the team; 319 of 408 `develop` commits (as of 11 Nov) carry the mention. Product and architecture decisions are the team's, every merge goes through human review and a green CI. The platform itself calls no AI model.",
				],
				image: "contract.png",
				imageAlt: "Single-contract diagram (web, REST, MCP); green CI",
			},
			{
				id: "status",
				kicker: "Where we are",
				title: "Live, at Systalink",
				bullets: [
					"Production runs on the Systalink Cloud Server in Dakar since 6 Nov 2026, over HTTPS (`/api/v1/health`, version v0.9.2, checked on 13 Nov).",
					"Snapshot of 13 Nov (Roadmap page, computed daily): 10 Questions, 6 active Members, 100% of Questions with an Answer, 90% with an accepted Answer.",
					"**All of this content is demo content**, loaded on 6 Nov and labelled as such: no Question or Answer has been written by a real tester yet. No first-answer delay: it means nothing on content loaded in bulk.",
					"No Goal is reached yet: each phase's Indicators (time to first Answer, active Members per week…) are tracked on the Roadmap page, with target values set after 30 days of real data.",
					"In the interest of honesty: the nightly backup is on the server; the off-server copy is planned, not in place.",
				],
				image: "production.png",
				imageAlt: "Production, public view (v0.9.2)",
			},
			{
				id: "next",
				kicker: "What's next",
				title: "What is shipped, what is planned",
				bullets: [
					"**Shipped**: search, reputation, folded Agent answers, watch feed, mixed \"For you\" feed, Organizations, jobs and Talent profiles, Hackathons published by Organizations.",
					"Each phase has three Indicators, with no Goal reached yet: values set after 30 days of real data (`/roadmap` page).",
				],
				planned: [
					"Notifications.",
					"Jury, public vote and tracking of Prizes paid.",
					"Mobile money payments (collecting job-post fees, phase 3).",
				],
				note: "Everything under \"Planned\" is an intention. Phases, statuses and Indicators: the Roadmap page.",
			},
			{
				id: "team",
				kicker: "The team",
				title: "Try CodeSphere",
				team: [
					["@0xdaydy", "captain, backend"],
					["@Justice-47", "frontend"],
					["@Strong-Ari", "frontend"],
					["@lamafx", "QA, documentation, deployment"],
				],
				cta: SITE,
			},
		],
		labels: { planned: "Planned", demo: "Screenshot to come" },
	},
};
