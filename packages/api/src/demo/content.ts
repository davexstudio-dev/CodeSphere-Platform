// Demo content for the CADEV demo (#57, docs/cadev/demo-script.md): four Members flagged « (démo) »,
// ten Questions on the local Tags, Answers, Votes and three Accepted answers, so the feed, the
// Scores and the Reputation are not empty. Never applied by a deploy: `bun run db:seed:demo` only.
// Fixed ids and idempotency keys make a replay change nothing.

export type DemoMember = {
	id: string;
	name: string;
	email: string;
	country: string;
};

export const demoMembers = [
	{
		id: "demo-aicha",
		name: "Aïcha Diallo (démo)",
		email: "aicha@demo.codesphere.invalid",
		country: "SN",
	},
	{
		id: "demo-koffi",
		name: "Koffi Agbeko (démo)",
		email: "koffi@demo.codesphere.invalid",
		country: "TG",
	},
	{
		id: "demo-mariam",
		name: "Mariam Traoré (démo)",
		email: "mariam@demo.codesphere.invalid",
		country: "BF",
	},
	{
		id: "demo-yannick",
		name: "Yannick Essomba (démo)",
		email: "yannick@demo.codesphere.invalid",
		country: "CM",
	},
] as const satisfies readonly DemoMember[];

type MemberId = (typeof demoMembers)[number]["id"];

export type DemoAnswer = {
	key: string;
	authorId: MemberId;
	body: string;
	/** Members who vote this Answer up. */
	upvotes: MemberId[];
	accepted?: boolean;
};

export type DemoQuestion = {
	key: string;
	authorId: MemberId;
	title: string;
	body: string;
	language: "fr" | "en";
	tags: string[];
	/** Members who vote this Question up. */
	upvotes: MemberId[];
	answers: DemoAnswer[];
};

// Idempotency keys: one fixed UUID per Question (…q…) and per Answer (…a…).
const q = (n: number) =>
	`0d3e0000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const a = (n: number) =>
	`0d3e0000-0000-4000-9000-${n.toString().padStart(12, "0")}`;

export const demoQuestions: DemoQuestion[] = [
	{
		key: q(1),
		authorId: "demo-mariam",
		title: "Comment vérifier la signature du callback Orange Money ?",
		body: "Mon serveur reçoit bien le callback de paiement, mais je ne sais pas comment être sûre qu'il vient d'Orange Money et pas de quelqu'un qui appelle mon URL.\n\nJ'utilise Node.js avec Express. Faut-il comparer un hash, ou rappeler l'API pour confirmer le statut ?",
		language: "fr",
		tags: ["orange-money", "mobile-money", "nodejs", "securite"],
		upvotes: ["demo-aicha", "demo-koffi", "demo-yannick"],
		answers: [
			{
				key: a(1),
				authorId: "demo-koffi",
				body: "Ne fais jamais confiance au seul callback. Deux règles :\n\n1. Vérifie le jeton ou la signature que le fournisseur joint au callback, comme le décrit sa documentation, et compare-le en temps constant.\n2. Avant de livrer, rappelle l'API de statut de la transaction avec son identifiant : c'est elle qui fait foi.\n\n```js\n// Comparaison en temps constant d'un jeton reçu avec celui attendu.\nconst ok =\n  received.length === expected.length &&\n  crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));\n```",
				upvotes: ["demo-mariam", "demo-aicha", "demo-yannick"],
				accepted: true,
			},
			{
				key: a(2),
				authorId: "demo-yannick",
				body: "En plus de la signature, rends ton traitement idempotent : le même callback peut arriver deux fois. Enregistre l'identifiant de transaction avec une contrainte d'unicité et ignore les doublons.",
				upvotes: ["demo-mariam"],
			},
		],
	},
	{
		key: q(2),
		authorId: "demo-aicha",
		title: "Quelle est la longueur maximale d'un écran USSD ?",
		body: "Je conçois un menu USSD pour une coopérative. Certains opérateurs coupent mon texte. Combien de caractères peut-on afficher sans risque ?",
		language: "fr",
		tags: ["ussd", "sms"],
		upvotes: ["demo-koffi", "demo-mariam"],
		answers: [
			{
				key: a(3),
				authorId: "demo-mariam",
				body: "Vise **182 caractères** au maximum par écran, et moins de 160 si tu veux être tranquille sur tous les opérateurs. Les caractères accentués peuvent compter double selon l'encodage : teste sur de vrais téléphones, pas seulement sur le simulateur de ton agrégateur.",
				upvotes: ["demo-aicha", "demo-koffi"],
				accepted: true,
			},
		],
	},
	{
		key: q(3),
		authorId: "demo-yannick",
		title: "Wave ou MTN MoMo : quelle API intégrer en premier ?",
		body: "Je lance une petite boutique en ligne entre Douala et Abidjan. Je n'ai le temps d'intégrer qu'un seul moyen de paiement mobile pour commencer. Vos retours d'expérience ?",
		language: "fr",
		tags: ["wave", "mtn-momo", "mobile-money"],
		upvotes: ["demo-aicha"],
		answers: [
			{
				key: a(4),
				authorId: "demo-aicha",
				body: "Regarde d'abord où sont tes clients : au Cameroun, MTN MoMo couvre plus de monde ; en Côte d'Ivoire et au Sénégal, Wave progresse vite et ses frais sont bas. Dans les deux cas, isole le paiement derrière une interface à toi pour ajouter le second plus tard sans tout réécrire.",
				upvotes: ["demo-yannick", "demo-koffi"],
			},
		],
	},
	{
		key: q(4),
		authorId: "demo-koffi",
		title:
			"Comment garder mon application Flutter utilisable avec une connexion qui coupe ?",
		body: "Mes utilisateurs sont souvent en 3G instable. L'application affiche une erreur dès que le réseau tombe. Quelle approche pour qu'elle reste utilisable hors ligne ?",
		language: "fr",
		tags: ["flutter", "dart", "performance"],
		upvotes: ["demo-mariam", "demo-yannick"],
		answers: [
			{
				key: a(5),
				authorId: "demo-yannick",
				body: "Approche *local-first* : lis toujours depuis un cache local (Drift ou Hive), affiche-le tout de suite, puis rafraîchis en arrière-plan. Pour les écritures, mets-les dans une file locale envoyée au retour du réseau, avec une clé d'idempotence pour que le serveur ignore les doublons.",
				upvotes: ["demo-koffi", "demo-mariam", "demo-aicha"],
				accepted: true,
			},
		],
	},
	{
		key: q(5),
		authorId: "demo-mariam",
		title: "Comment préparer une démo pour la CADEV 2026 ?",
		body: "Première participation à la Coupe d'Afrique des Développeurs. Qu'est-ce que le jury regarde vraiment pendant les trois minutes de démo ?",
		language: "fr",
		tags: ["cadev-2026", "hackathon"],
		upvotes: ["demo-koffi", "demo-aicha"],
		answers: [
			{
				key: a(6),
				authorId: "demo-aicha",
				body: "Un seul parcours, répété jusqu'à le connaître par cœur, sur l'application réelle. Prépare un plan B (une vidéo) si le réseau de la salle tombe, et ne montre que ce qui marche vraiment.",
				upvotes: ["demo-mariam"],
			},
		],
	},
	{
		key: q(6),
		authorId: "demo-aicha",
		title: "How do I send SMS notifications cheaply from a Node.js API?",
		body: "We need to send order confirmations by SMS in Senegal and Côte d'Ivoire. Which providers work well, and how do you keep the cost down?",
		language: "en",
		tags: ["sms", "nodejs", "api"],
		upvotes: ["demo-yannick"],
		answers: [
			{
				key: a(7),
				authorId: "demo-koffi",
				body: "Use a local aggregator rather than a global one: delivery is better and the price per SMS is lower. Batch non-urgent messages, keep them under 160 GSM-7 characters (no emoji), and fall back to WhatsApp or push when the user has the app.",
				upvotes: ["demo-aicha"],
			},
		],
	},
	{
		key: q(7),
		authorId: "demo-yannick",
		title: "PostgreSQL : index sur une colonne de numéros de téléphone",
		body: "Je cherche des clients par numéro de téléphone, saisi avec ou sans indicatif (`+237`, `00237`…). Les requêtes sont lentes. Comment indexer proprement ?",
		language: "fr",
		tags: ["postgresql", "sql", "performance"],
		upvotes: ["demo-mariam"],
		answers: [],
	},
	{
		key: q(8),
		authorId: "demo-koffi",
		title: "Déployer une API Node.js sur un petit VPS : Docker ou pas ?",
		body: "J'ai un VPS à 2 Go de RAM. Est-ce que Docker vaut le coût en mémoire, ou vaut-il mieux un simple service systemd ?",
		language: "fr",
		tags: ["docker", "deploiement", "linux"],
		upvotes: ["demo-aicha"],
		answers: [],
	},
	{
		key: q(9),
		authorId: "demo-mariam",
		title: "Which Tags should a beginner follow to learn web development?",
		body: "I am starting out and the feed feels overwhelming. Which Tags would you follow first?",
		language: "en",
		tags: ["debutant", "javascript"],
		upvotes: ["demo-koffi"],
		answers: [],
	},
	{
		key: q(10),
		authorId: "demo-aicha",
		title: "Tester un menu USSD sans téléphone",
		body: "Existe-t-il un simulateur USSD pour tester mes menus en local avant de les envoyer à l'agrégateur ?",
		language: "fr",
		tags: ["ussd", "tests"],
		upvotes: [],
		answers: [],
	},
];
