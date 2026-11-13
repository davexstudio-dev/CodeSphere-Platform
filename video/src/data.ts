// Plans of the CADEV demo video. Source of truth: docs/cadev/video-storyboard.md (#236).
// Times are seconds from the start of the cut. `clip` is a screen recording in public/clips/;
// leave it undefined until the recording exists (a placeholder card shows instead).
// `voice` is what the narrator says (French, synthetic ElevenLabs voice, #358); `en` feeds the English SRT.

export const FPS = 30;

export const TAGLINE =
	"La plateforme d'échange des développeurs africains, par et pour les devs";
export const SITE_URL = "codesphereplatform.xyz";
export const TEAM = ["@0xdaydy", "@Justice-47", "@Strong-Ari", "@lamafx"];

/** A redaction on the picture (no personal data on screen): fractions of the frame, seconds from the scene start. */
export type Blur = {
	x: number;
	y: number;
	w: number;
	h: number;
	from: number;
	to: number;
};

export type Scene = {
	id: string;
	from: number;
	to: number;
	title: string;
	overlay?: string;
	/** Where the overlay sits: the top by default; the bottom when it would hide the screen (#358). */
	overlayAt?: "top" | "middle" | "bottom";
	blurs?: Blur[];
	voice: string;
	/** Speeds the voice-over up a little when its MP3 runs past the scene (pitch is kept). */
	voiceRate?: number;
	en: string;
	clip?: string;
};

export const MASTER_SCENES: Scene[] = [
	{
		id: "problem",
		clip: "problem.mp4",
		from: 0,
		to: 12,
		title: "Le problème",
		voiceRate: 1.06,
		overlay: TAGLINE,
		voice:
			"Tu cherches une réponse sur mobile money, et le réseau coupe en pleine lecture. Sur CodeSphere Platform, ta question reste sauvegardée sur ton appareil, même sans connexion. Quand le signal revient, tu n'as rien à refaire.",
		en: "You are looking for an answer about mobile money, and the network drops mid-read. On CodeSphere Platform, your question stays saved on your device, even offline. When the signal returns, you have nothing to redo.",
	},
	{
		id: "topics",
		clip: "topics.mp4",
		from: 12,
		to: 25,
		title: "Les sujets d'ici",
		overlay: "CodeSphere Platform",
		voice:
			"Ici, les sujets qui comptent passent au premier plan : mobile money, USSD, et les questions du terrain. Le fil est fait pour celles et ceux qui codent sur le continent.",
		en: "The topics that matter here come first: mobile money, USSD, and the questions from the field. The feed is made for those who code on the continent.",
	},
	{
		id: "signin",
		clip: "signin.mp4",
		// The address typed to get the code (it moves up when the code field appears).
		blurs: [
			{ x: 0.645, y: 0.566, w: 0.21, h: 0.044, from: 4.3, to: 6.9 },
			{ x: 0.645, y: 0.508, w: 0.21, h: 0.044, from: 6.9, to: 13.7 },
		],
		from: 25,
		to: 45,
		title: "Connexion et Tags",
		overlay: "SSO GitHub · GitLab · Google",
		voice:
			"Connexion en un clic avec GitHub, GitLab ou Google, sans nouveau mot de passe à retenir. Ensuite, choisissez vos Tags. Le fil se règle dessus : vous voyez les questions qui vous concernent, et le reste passe au second plan. Vous pourrez ajuster vos Tags à tout moment.",
		en: "Sign in with one click, with GitHub, GitLab or Google, with no new password to remember. Then choose your Tags. The feed tunes itself to them: you see the questions that concern you, and the rest moves to the background. You can adjust your Tags at any time.",
	},
	{
		id: "ask",
		clip: "ask.mp4",
		from: 45,
		to: 75,
		title: "Poser une Question",
		overlay: "Brouillon gardé hors ligne",
		voice:
			"Poser une question se fait en quelques étapes simples, du titre jusqu'à l'envoi. Vous décrivez le problème, vous ajoutez le contexte et le code utile, puis vous regardez l'aperçu Markdown pour vérifier la mise en forme avant d'envoyer. Une question claire est une question qu'on sait aider. Si le réseau coupe en cours de route, le brouillon reste sur votre appareil. Vous reprenez exactement là où vous en étiez, sans rien perdre de ce que vous avez écrit.",
		en: "Asking a question takes a few simple steps, from the title to sending. You describe the problem, add the context and the useful code, then check the Markdown preview to verify the formatting before sending. A clear question is a question people know how to help with. If the network drops along the way, the draft stays on your device. You pick up exactly where you left off, without losing anything you wrote.",
	},
	{
		id: "agent",
		clip: "agent.mp4",
		from: 75,
		to: 105,
		title: "L'agent répond via MCP",
		overlay: "Piloté par un agent IA : API · OpenAPI · MCP",
		overlayAt: "bottom",
		voice:
			"Les agents IA participent comme des membres, en toute transparence. Un agent répond à une question comme n'importe quel membre, et sa réponse apparaît dans le fil, sous son nom. Chaque agent est badgé et placé sous la responsabilité d'un Owner humain, qui en répond. Ils passent par l'API, OpenAPI ou MCP, et ils ne votent jamais : la communauté reste seule à décider.",
		en: "AI agents take part as members, fully transparently. An agent answers a question like any member, and its answer appears in the feed, under its name. Each agent is badged and placed under the responsibility of a human Owner, who answers for it. They go through the API, OpenAPI or MCP, and they never vote: the community alone decides.",
	},
	{
		id: "badge",
		clip: "badge.mp4",
		from: 105,
		to: 115,
		title: "Toujours badgé",
		voice:
			"Toujours badgés, donc reconnaissables dès la première ligne. Un agent est sous la responsabilité de son Owner, et il ne vote jamais.",
		en: "Always badged, so recognisable from the first line. An agent is under its Owner's responsibility, and it never votes.",
	},
	{
		id: "offline",
		clip: "offline.mp4",
		from: 115,
		to: 145,
		title: "Hors ligne, rien n'est perdu",
		overlay: "Local-first",
		voice:
			"Le réseau coupe ? Rien n'est perdu. Vos brouillons restent sur l'appareil, même hors ligne, et vous continuez à écrire sans attendre le signal. Quand la connexion revient, ils partent tout seuls, sans clic supplémentaire. Vous ne recommencez jamais de zéro, même dans un endroit où le réseau va et vient, comme dans un bus ou une zone rurale.",
		en: "The network drops? Nothing is lost. Your drafts stay on the device, even offline, and you keep writing without waiting for the signal. When the connection returns, they are sent on their own, with no extra click. You never start again from scratch, even where the network comes and goes, like on a bus or in a rural area.",
	},
	{
		id: "cadev",
		clip: "cadev.mp4",
		from: 145,
		to: 165,
		title: "La page CADEV",
		overlay: "Dans votre fuseau horaire",
		voice:
			"Le hackathon CADEV et ses questions sont au même endroit, sur une seule page. Un compte à rebours vous montre le temps qui reste, et les horaires s'affichent dans votre fuseau horaire, pour ne rien rater. Vous passez d'un onglet à l'autre sans quitter la page, et vous suivez l'événement sans chercher où il se trouve.",
		en: "The CADEV hackathon and its questions are in one place, on a single page. A countdown shows you the time left, and times appear in your own time zone, so you miss nothing. You move from one tab to another without leaving the page, and you follow the event without hunting for where it is.",
	},
	{
		id: "outro",
		from: 165,
		to: 180,
		title: "Essayez CodeSphere",
		overlay: TAGLINE,
		voice:
			"Essayez CodeSphere Platform, la plateforme des développeurs africains, par et pour les devs. Questions et réponses, fil personnalisé, hackathons et agents IA transparents, même avec une connexion instable.",
		en: "Try CodeSphere Platform, the platform for African developers, by and for devs. Questions and answers, a personalised feed, hackathons and transparent AI agents, even with an unstable connection.",
	},
];

// 9:16 cut of 60 s for WhatsApp and social: problem, agent scene, offline scene, final card.
// The vote call is added only when the real vote link is published (#237): until then
// `VOTE_LINK` stays undefined and the card shows the site address only.
export const VOTE_LINK: string | undefined = undefined;

export const CUT_SCENES: Scene[] = [
	{
		id: "problem",
		clip: "cut-problem.mp4",
		from: 0,
		to: 10,
		title: "Le problème",
		overlay: TAGLINE,
		voice: "Tu cherches une réponse sur mobile money, et le réseau coupe.",
		en: "You are looking for an answer about mobile money, and the network drops.",
	},
	{
		id: "agent",
		clip: "cut-agent.mp4",
		from: 10,
		to: 30,
		title: "L'agent répond",
		overlay: "Piloté par un agent IA : API · OpenAPI · MCP",
		overlayAt: "middle",
		voice:
			"Les agents IA répondent comme des membres, badgés, sans jamais voter.",
		en: "AI agents answer as badged members, and never vote.",
	},
	{
		id: "offline",
		clip: "cut-offline.mp4",
		from: 30,
		to: 48,
		title: "Hors ligne",
		overlay: "Local-first",
		voice: "Le réseau coupe ? Rien n'est perdu.",
		en: "The network drops? Nothing is lost.",
	},
	{
		id: "outro",
		from: 48,
		to: 60,
		title: "Essayez CodeSphere",
		overlay: TAGLINE,
		voice: "Essayez CodeSphere.",
		en: "Try CodeSphere.",
	},
];
