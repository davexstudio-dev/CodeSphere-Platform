// Demo content for the CADEV demo (#57, docs/cadev/demo-script.md): six Members, ten Questions on
// the local Tags with several Answers each, Votes and Accepted answers, so the feed, the Scores and
// the Reputation are not empty. Never applied by a deploy: `bun run db:seed:demo` only.
// Fixed ids and idempotency keys make a replay change nothing. The ids and the `.invalid` emails
// mark these accounts as demo data in the database; nothing in the interface does.

export type DemoMember = {
	id: string;
	name: string;
	email: string;
	country: string;
};

export const demoMembers = [
	{
		id: "demo-aicha",
		name: "Aïcha Diallo",
		email: "aicha@demo.codesphere.invalid",
		country: "SN",
	},
	{
		id: "demo-koffi",
		name: "Koffi Agbeko",
		email: "koffi@demo.codesphere.invalid",
		country: "TG",
	},
	{
		id: "demo-mariam",
		name: "Mariam Traoré",
		email: "mariam@demo.codesphere.invalid",
		country: "BF",
	},
	{
		id: "demo-yannick",
		name: "Yannick Essomba",
		email: "yannick@demo.codesphere.invalid",
		country: "CM",
	},
	{
		id: "demo-ibrahim",
		name: "Ibrahim Sanogo",
		email: "ibrahim@demo.codesphere.invalid",
		country: "CI",
	},
	{
		id: "demo-grace",
		name: "Grâce Mukendi",
		email: "grace@demo.codesphere.invalid",
		country: "CD",
	},
] as const satisfies readonly DemoMember[];

export type MemberId = (typeof demoMembers)[number]["id"];

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

// Idempotency keys: one fixed UUID per Question (…8000…) and per Answer (…9000…).
const q = (n: number) =>
	`0d3e0000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const a = (n: number) =>
	`0d3e0000-0000-4000-9000-${n.toString().padStart(12, "0")}`;

export const demoQuestions: DemoQuestion[] = [
	{
		key: q(1),
		authorId: "demo-mariam",
		title:
			"Comment vérifier que le callback Orange Money vient bien d'Orange ?",
		body: `Je développe la boutique en ligne d'une coopérative de karité à Bobo-Dioulasso. Le paiement Orange Money fonctionne : après le paiement, mon serveur reçoit bien un appel sur mon URL de callback avec le statut de la transaction.

Mon problème : n'importe qui peut appeler cette URL. Pour l'instant je marque la commande comme payée dès que le callback dit \`SUCCESS\`, ce qui me paraît dangereux.

\`\`\`js
app.post("/paiement/callback", express.json(), async (req, res) => {
  if (req.body.status === "SUCCESS") {
    await commandes.marquerPayee(req.body.order_id);
  }
  res.sendStatus(200);
});
\`\`\`

Qu'est-ce qu'il faut vérifier avant de livrer ? Faut-il comparer un jeton, ou rappeler l'API pour confirmer le statut ?`,
		language: "fr",
		tags: ["orange-money", "mobile-money", "nodejs", "securite"],
		upvotes: ["demo-aicha", "demo-koffi", "demo-yannick", "demo-grace"],
		answers: [
			{
				key: a(1),
				authorId: "demo-koffi",
				body: `Tu as raison de t'inquiéter : le callback n'est qu'une notification, pas une preuve. Deux règles :

1. **Vérifie le jeton ou la signature** que le fournisseur joint au callback, comme le décrit sa documentation, et compare-le en temps constant.
2. **Avant de livrer, rappelle l'API de statut** de la transaction avec son identifiant : c'est elle qui fait foi, pas le corps du callback.

\`\`\`js
// Comparaison en temps constant d'un jeton reçu avec celui attendu.
const ok =
  received.length === expected.length &&
  crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
\`\`\`

Vérifie aussi que le montant et la devise confirmés correspondent à ta commande : un paiement réussi de 100 F ne doit pas valider une commande de 25 000 F.`,
				upvotes: ["demo-mariam", "demo-aicha", "demo-yannick", "demo-ibrahim"],
				accepted: true,
			},
			{
				key: a(2),
				authorId: "demo-yannick",
				body: `En plus de la vérification, rends ton traitement **idempotent** : le même callback peut arriver deux fois (nouvel essai du fournisseur après un délai dépassé, par exemple).

Enregistre l'identifiant de la transaction avec une contrainte d'unicité, et ignore un doublon au lieu de traiter la commande deux fois :

\`\`\`sql
CREATE UNIQUE INDEX paiements_transaction_uniq ON paiements (transaction_id);
\`\`\``,
				upvotes: ["demo-mariam", "demo-koffi"],
			},
			{
				key: a(3),
				authorId: "demo-ibrahim",
				body: "Pense aussi à journaliser chaque callback reçu (horodatage, identifiant, statut, résultat de ta vérification) sans stocker de données personnelles inutiles. Le jour où un client dit « j'ai payé mais rien reçu », c'est ce journal qui te permet de répondre en deux minutes.",
				upvotes: ["demo-mariam"],
			},
		],
	},
	{
		key: q(2),
		authorId: "demo-aicha",
		title: "Quelle est la longueur maximale d'un écran USSD ?",
		body: `Je conçois un menu USSD pour une coopérative de maraîchers à Thiès : consulter son solde, commander des semences, recevoir le prix du jour.

Sur certains téléphones, le texte de mon menu est coupé en plein milieu d'une ligne. Sur le simulateur de mon agrégateur, tout s'affiche.

- Combien de caractères peut-on afficher sans risque sur un écran ?
- Les accents comptent-ils autant que les autres caractères ?`,
		language: "fr",
		tags: ["ussd", "sms"],
		upvotes: ["demo-koffi", "demo-mariam", "demo-ibrahim"],
		answers: [
			{
				key: a(4),
				authorId: "demo-mariam",
				body: `La norme USSD permet jusqu'à **182 caractères** par message, mais vise **160 au maximum** si tu veux être tranquille sur tous les opérateurs et tous les téléphones.

Pour les accents, tout dépend de l'encodage : dès qu'un caractère sort de l'alphabet GSM de base, le message peut passer dans un encodage où chaque caractère compte double. Teste toujours sur de vrais téléphones d'entrée de gamme, pas seulement sur le simulateur.`,
				upvotes: ["demo-aicha", "demo-koffi", "demo-grace"],
				accepted: true,
			},
			{
				key: a(5),
				authorId: "demo-ibrahim",
				body: "Garde aussi tes menus courts en profondeur : la session USSD expire au bout d'un délai qui varie selon l'opérateur. Trois niveaux maximum, des choix numérotés de 1 à 5, et toujours un « 0 Retour ». Stocke l'état de la session côté serveur pour reprendre là où l'utilisateur en était s'il relance le code.",
				upvotes: ["demo-aicha", "demo-mariam"],
			},
			{
				key: a(6),
				authorId: "demo-grace",
				body: "Astuce : écris tes libellés sans accents dans les menus (« Solde », « Commander », « Prix du jour ») et garde les accents pour les messages de confirmation, plus longs mais lus une seule fois. Les utilisateurs comprennent très bien, et tu évites les surprises d'encodage.",
				upvotes: ["demo-aicha"],
			},
		],
	},
	{
		key: q(3),
		authorId: "demo-yannick",
		title: "Wave ou MTN MoMo : quelle API intégrer en premier ?",
		body: `Je lance une petite boutique en ligne de pièces détachées entre Douala et Abidjan. Je n'ai le temps d'intégrer qu'un seul moyen de paiement mobile pour le lancement, le second viendra dans deux ou trois mois.

Ce qui compte pour moi :
- là où sont mes premiers clients ;
- les frais par transaction ;
- la facilité d'intégration et la qualité du bac à sable.

Vos retours d'expérience ?`,
		language: "fr",
		tags: ["wave", "mtn-momo", "mobile-money"],
		upvotes: ["demo-aicha", "demo-grace", "demo-ibrahim"],
		answers: [
			{
				key: a(7),
				authorId: "demo-aicha",
				body: "Regarde d'abord où sont tes clients : au Cameroun, MTN MoMo couvre plus de monde ; en Côte d'Ivoire et au Sénégal, Wave a beaucoup progressé. Si ton premier marché est Douala, commence par MoMo.",
				upvotes: ["demo-yannick", "demo-koffi", "demo-grace"],
			},
			{
				key: a(8),
				authorId: "demo-grace",
				body: `Quel que soit ton choix, isole le paiement derrière une interface à toi, pour ajouter le second fournisseur sans toucher au reste de la boutique :

\`\`\`ts
interface PaiementMobile {
  demander(commande: Commande): Promise<{ reference: string }>;
  statut(reference: string): Promise<"en_attente" | "reussi" | "echoue">;
}
\`\`\`

Une classe par fournisseur, et la boutique ne connaît que \`PaiementMobile\`.`,
				upvotes: ["demo-yannick", "demo-ibrahim", "demo-koffi"],
			},
			{
				key: a(9),
				authorId: "demo-ibrahim",
				body: "Avant de choisir, ouvre les deux bacs à sable et fais un paiement de test complet sur chacun : création, callback, vérification du statut. En une demi-journée tu sauras lequel a la documentation la plus claire pour toi.",
				upvotes: ["demo-yannick"],
			},
		],
	},
	{
		key: q(4),
		authorId: "demo-koffi",
		title:
			"Comment garder mon application Flutter utilisable quand la connexion coupe ?",
		body: `Mon application de suivi de livraisons est utilisée par des livreurs à moto à Lomé, souvent en 3G instable. Dès que le réseau tombe, l'écran affiche une erreur et la liste des colis disparaît.

Aujourd'hui, chaque écran fait un appel HTTP à l'ouverture et affiche le résultat. Quand un livreur valide une livraison hors ligne, l'action est perdue.

Quelle approche pour que l'application reste utilisable hors ligne, et que les validations partent quand le réseau revient ?`,
		language: "fr",
		tags: ["flutter", "dart", "performance"],
		upvotes: ["demo-mariam", "demo-yannick", "demo-aicha", "demo-ibrahim"],
		answers: [
			{
				key: a(10),
				authorId: "demo-yannick",
				body: `Approche *local-first* :

1. **Lecture** : affiche toujours d'abord le cache local (Drift ou Hive), puis rafraîchis en arrière-plan quand le réseau est là.
2. **Écriture** : chaque validation va dans une file locale, envoyée au retour du réseau.
3. **Doublons** : chaque action porte une clé d'idempotence générée sur le téléphone, pour que le serveur ignore une action reçue deux fois.

Le livreur ne voit plus jamais d'écran vide, et aucune validation n'est perdue.`,
				upvotes: ["demo-koffi", "demo-mariam", "demo-aicha", "demo-grace"],
				accepted: true,
			},
			{
				key: a(11),
				authorId: "demo-mariam",
				body: "Attention à un piège : `connectivity_plus` te dit si le téléphone est connecté à un réseau, pas si Internet répond. Sur un Wi-Fi sans accès ou une 3G saturée, il dira « connecté ». Pour décider de vider ta file, tente l'envoi et gère l'échec, plutôt que de te fier au seul indicateur.",
				upvotes: ["demo-koffi", "demo-yannick"],
			},
			{
				key: a(12),
				authorId: "demo-aicha",
				body: "Pour les photos de preuve de livraison, compresse-les sur le téléphone avant de les mettre en file, et envoie-les après les données texte. Les validations partent en quelques secondes, les photos suivent quand le réseau le permet.",
				upvotes: ["demo-koffi"],
			},
		],
	},
	{
		key: q(5),
		authorId: "demo-grace",
		title: "Comment préparer une démo de 3 minutes pour la CADEV 2026 ?",
		body: `Première participation à la Coupe d'Afrique des Développeurs avec mon équipe de Kinshasa. Notre application fait beaucoup de choses et on a peur de manquer de temps.

- Qu'est-ce que le jury regarde vraiment pendant la démo ?
- Faut-il montrer toutes les fonctionnalités ou une seule ?
- Comment éviter la panne en direct ?`,
		language: "fr",
		tags: ["cadev-2026", "hackathon"],
		upvotes: ["demo-koffi", "demo-aicha", "demo-mariam"],
		answers: [
			{
				key: a(13),
				authorId: "demo-koffi",
				body: `Un seul parcours, raconté comme une histoire :

1. **20 secondes** : le problème, avec une personne réelle (« Awa, développeuse à Dakar, bloquée sur… »).
2. **2 minutes** : le parcours complet dans l'application réelle, sans diapositive.
3. **30 secondes** : ce qui rend votre solution différente, et ce qui vient ensuite.

Ne montrez que ce qui marche vraiment, et répétez jusqu'à tenir le temps sans regarder vos notes.`,
				upvotes: ["demo-grace", "demo-aicha", "demo-yannick", "demo-ibrahim"],
				accepted: true,
			},
			{
				key: a(14),
				authorId: "demo-aicha",
				body: "Préparez un plan B : une vidéo du même parcours, prête à lancer si le réseau de la salle tombe. Et ouvrez à l'avance les sessions, les onglets et le terminal dont vous aurez besoin, pour ne rien taper de long en direct.",
				upvotes: ["demo-grace", "demo-mariam"],
			},
			{
				key: a(15),
				authorId: "demo-mariam",
				body: "Faites tester la démo par quelqu'un qui ne connaît pas le projet. S'il ne comprend pas ce qui se passe à l'écran sans votre voix, c'est que le parcours est trop chargé.",
				upvotes: ["demo-grace"],
			},
		],
	},
	{
		key: q(6),
		authorId: "demo-aicha",
		title: "How do I send SMS notifications cheaply from a Node.js API?",
		body: `We need to send order confirmations by SMS to customers in Senegal and Côte d'Ivoire, from a Node.js API. Volume is a few thousand messages a month for now.

- Local aggregator or a global provider?
- How do you keep the cost per message down?
- Anything to watch for with French text and accents?`,
		language: "en",
		tags: ["sms", "nodejs", "api"],
		upvotes: ["demo-yannick", "demo-ibrahim", "demo-koffi"],
		answers: [
			{
				key: a(16),
				authorId: "demo-ibrahim",
				body: `Watch the encoding first: it drives the price.

- With plain **GSM-7** characters, one SMS holds **160 characters**.
- A single character outside that alphabet switches the whole message to **UCS-2**, which holds only **70 characters**, so the same text may cost two or three SMS.

Write templates in plain GSM-7 (no emoji, no curly quotes), check the length before sending, and send one message, not three.`,
				upvotes: ["demo-aicha", "demo-koffi", "demo-grace"],
				accepted: true,
			},
			{
				key: a(17),
				authorId: "demo-koffi",
				body: "A local aggregator usually gives better delivery rates and a lower price per SMS than a global provider in West Africa. Ask for their delivery reports (DLR) and track them: an SMS sent is not an SMS delivered.",
				upvotes: ["demo-aicha", "demo-yannick"],
			},
			{
				key: a(18),
				authorId: "demo-grace",
				body: "Batch non-urgent messages (daily summaries, reminders), and when the customer has your app, prefer a push notification and keep SMS for what must arrive: payment confirmations and one-time codes.",
				upvotes: ["demo-aicha"],
			},
		],
	},
	{
		key: q(7),
		authorId: "demo-yannick",
		title:
			"PostgreSQL : rechercher un client par numéro de téléphone, quel que soit le format saisi",
		body: `Ma table \`clients\` contient environ 400 000 lignes. Les numéros ont été saisis à la main pendant des années : \`+237 6 99 12 34 56\`, \`00237699123456\`, \`699123456\`, avec ou sans espaces.

\`\`\`sql
SELECT * FROM clients
WHERE regexp_replace(telephone, '\\D', '', 'g') LIKE '%699123456';
\`\`\`

Cette requête prend plusieurs secondes. Comment indexer proprement pour retrouver un client à partir de n'importe quel format ?`,
		language: "fr",
		tags: ["postgresql", "sql", "performance"],
		upvotes: ["demo-mariam", "demo-grace", "demo-koffi"],
		answers: [
			{
				key: a(19),
				authorId: "demo-grace",
				body: `Normalise à l'écriture plutôt qu'à la lecture. Stocke une version normalisée du numéro au format international (E.164, par exemple \`+237699123456\`) dans une colonne dédiée, indexée :

\`\`\`sql
ALTER TABLE clients ADD COLUMN telephone_e164 text;
-- Remplir la colonne une fois avec une fonction de normalisation, puis :
CREATE INDEX clients_telephone_e164_idx ON clients (telephone_e164);
\`\`\`

À la recherche, normalise la saisie de la même façon et fais une égalité stricte : la requête passe de plusieurs secondes à quelques millisecondes.`,
				upvotes: ["demo-yannick", "demo-koffi", "demo-mariam"],
				accepted: true,
			},
			{
				key: a(20),
				authorId: "demo-koffi",
				body: "Si tu as vraiment besoin de chercher sur une partie du numéro (les 6 derniers chiffres, par exemple), regarde l'extension `pg_trgm` avec un index GIN : elle accélère les recherches `LIKE '%…%'`, au prix d'un index plus gros.",
				upvotes: ["demo-yannick"],
			},
			{
				key: a(21),
				authorId: "demo-ibrahim",
				body: "Pour la normalisation elle-même, ne réinvente pas les règles de chaque pays : une bibliothèque comme libphonenumber (il existe des portages en JavaScript, Python, PHP…) connaît les indicatifs et les longueurs valides.",
				upvotes: ["demo-yannick", "demo-grace"],
			},
		],
	},
	{
		key: q(8),
		authorId: "demo-ibrahim",
		title:
			"Déployer une API Node.js sur un petit VPS de 2 Go : Docker ou systemd ?",
		body: `J'héberge l'API de mon application de tontine sur un VPS à 2 Go de RAM, avec PostgreSQL sur la même machine. Aujourd'hui je lance l'API avec \`pm2\`.

J'hésite à passer à Docker pour que mes déploiements soient reproductibles, mais j'ai peur que la mémoire ne suffise plus.

Docker vaut-il le coût sur une si petite machine, ou un simple service systemd suffit ?`,
		language: "fr",
		tags: ["docker", "deploiement", "linux", "nodejs"],
		upvotes: ["demo-aicha", "demo-yannick"],
		answers: [
			{
				key: a(22),
				authorId: "demo-yannick",
				body: `Docker lui-même consomme peu de mémoire : ce sont tes processus qui comptent, conteneurisés ou non. Sur 2 Go, ça passe très bien si tu fixes des limites :

\`\`\`yaml
services:
  api:
    image: mon-api:1.4.0
    mem_limit: 512m
    restart: unless-stopped
\`\`\`

Le vrai gain, c'est la reproductibilité : la même image en local, en préproduction et en production.`,
				upvotes: ["demo-ibrahim", "demo-aicha", "demo-koffi"],
				accepted: true,
			},
			{
				key: a(23),
				authorId: "demo-mariam",
				body: "Si tu restes sur une seule API sans dépendance exotique, un service systemd est plus simple : `Restart=always`, les logs dans journald, et `MemoryMax=` pour la limite. Tu peux passer à Docker le jour où tu auras plusieurs services à orchestrer.",
				upvotes: ["demo-ibrahim"],
			},
			{
				key: a(24),
				authorId: "demo-koffi",
				body: "Dans les deux cas, ajoute un peu de swap (1 à 2 Go) et surveille la mémoire de PostgreSQL : sur une petite machine, c'est souvent lui qui prend la place, pas l'API.",
				upvotes: ["demo-ibrahim", "demo-yannick"],
			},
		],
	},
	{
		key: q(9),
		authorId: "demo-grace",
		title: "Which Tags should a beginner follow to learn web development?",
		body: `I am a self-taught beginner in Lubumbashi. I know some HTML and CSS and I want to build real web applications.

The feed shows a lot of advanced topics and I feel lost. Which Tags would you follow first, and in what order would you learn things?`,
		language: "en",
		tags: ["debutant", "javascript"],
		upvotes: ["demo-koffi", "demo-aicha"],
		answers: [
			{
				key: a(25),
				authorId: "demo-aicha",
				body: "Start with `debutant`, `javascript` and `git`. Learn JavaScript well before any framework: the DOM, `fetch`, promises. Then pick one framework (`react`) and one small project you actually care about, and finish it.",
				upvotes: ["demo-grace", "demo-koffi", "demo-mariam"],
				accepted: true,
			},
			{
				key: a(26),
				authorId: "demo-koffi",
				body: "Add `api` and `nodejs` once you are comfortable on the front end: building a small API that your page calls teaches you how the web really works. Ask questions here when you are stuck for more than an hour, with your code and what you tried.",
				upvotes: ["demo-grace"],
			},
		],
	},
	{
		key: q(10),
		authorId: "demo-aicha",
		title: "Tester un menu USSD sans téléphone ni agrégateur",
		body: `Mon menu USSD a maintenant une dizaine d'écrans. À chaque modification, je dois composer le code sur un vrai téléphone et tout parcourir à la main, ce qui prend du temps et coûte des sessions chez l'agrégateur.

Comment tester mes menus en local, idéalement de façon automatique, avant de les envoyer chez l'agrégateur ?`,
		language: "fr",
		tags: ["ussd", "tests"],
		upvotes: ["demo-ibrahim", "demo-mariam"],
		answers: [
			{
				key: a(27),
				authorId: "demo-ibrahim",
				body: `Écris ton menu comme une **machine à états** pure : une fonction qui prend l'état de la session et la saisie, et renvoie le texte à afficher et le nouvel état. Plus de téléphone nécessaire pour la tester :

\`\`\`js
test("1 puis 2 affiche le prix du jour", () => {
  let s = menu.demarrer();
  s = menu.saisir(s, "1");
  s = menu.saisir(s, "2");
  expect(s.ecran).toContain("Prix du jour");
});
\`\`\`

Le serveur HTTP qui reçoit les appels de l'agrégateur ne fait plus que traduire sa requête vers cette fonction.`,
				upvotes: ["demo-aicha", "demo-mariam", "demo-grace"],
				accepted: true,
			},
			{
				key: a(28),
				authorId: "demo-mariam",
				body: "Plusieurs agrégateurs proposent aussi un simulateur USSD dans leur bac à sable. Garde-le pour la dernière vérification de bout en bout, et ajoute dans tes tests une vérification que chaque écran fait moins de 160 caractères.",
				upvotes: ["demo-aicha"],
			},
		],
	},
];
