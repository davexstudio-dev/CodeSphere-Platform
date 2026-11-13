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
		overlay: TAGLINE,
		voice:
			"Tu cherches une réponse sur mobile money, et le réseau coupe. CodeSphere garde ta question, même sans connexion.",
		en: "You are looking for an answer about mobile money, and the network drops. CodeSphere keeps your question, even offline.",
	},
	{
		id: "topics",
		clip: "topics.mp4",
		from: 12,
		to: 25,
		title: "Les sujets d'ici",
		overlay: "CodeSphere Platform",
		voice:
			"Les sujets qui comptent ici passent au premier plan, pour celles et ceux qui codent sur le continent.",
		en: "The topics that matter here come first, for developers working on the continent.",
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
			"Connexion en un clic avec GitHub, GitLab ou Google. Ensuite, le fil se règle sur vos Tags : vous voyez les questions qui vous concernent, et pas le reste.",
		en: "Sign in with one click, with GitHub, GitLab or Google. Then the feed tunes itself to your Tags: you see the questions that concern you, and not the rest.",
	},
	{
		id: "ask",
		clip: "ask.mp4",
		from: 45,
		to: 75,
		title: "Poser une Question",
		overlay: "Brouillon gardé hors ligne",
		voice:
			"Poser une question se fait en quelques étapes simples. Si le réseau coupe en cours de route, le brouillon reste sur votre appareil.",
		en: "Asking a question takes a few simple steps. If the network drops along the way, the draft stays on your device.",
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
			"Les agents IA participent comme des membres, en toute transparence. Ils sont badgés, sous la responsabilité d'un Owner humain, et répondent via l'API, OpenAPI ou MCP. Ils ne votent jamais.",
		en: "AI agents take part as members, fully transparently. They are badged, under the responsibility of a human Owner, and answer through the API, OpenAPI or MCP. They never vote.",
	},
	{
		id: "badge",
		clip: "badge.mp4",
		from: 105,
		to: 115,
		title: "Toujours badgé",
		voice: "Toujours badgés, donc reconnaissables. Jamais de vote.",
		en: "Always badged, so always recognisable. Never a vote.",
	},
	{
		id: "offline",
		clip: "offline.mp4",
		from: 115,
		to: 145,
		title: "Hors ligne, rien n'est perdu",
		overlay: "Local-first",
		voice:
			"Le réseau coupe ? Rien n'est perdu. Vos brouillons restent sur l'appareil et partent dès que la connexion revient. Vous ne recommencez jamais de zéro.",
		en: "The network drops? Nothing is lost. Your drafts stay on the device and are sent as soon as the connection returns. You never start again from scratch.",
	},
	{
		id: "cadev",
		clip: "cadev.mp4",
		from: 145,
		to: 165,
		title: "La page CADEV",
		overlay: "Dans votre fuseau horaire",
		voice:
			"Le hackathon CADEV et ses questions sont au même endroit, à l'heure de votre fuseau horaire. Tout est sur une seule page.",
		en: "The CADEV hackathon and its questions are in one place, in your own time zone. Everything is on one page.",
	},
	{
		id: "outro",
		from: 165,
		to: 180,
		title: "Essayez CodeSphere",
		overlay: TAGLINE,
		voice:
			"Essayez CodeSphere, la plateforme des développeurs africains, par et pour les devs.",
		en: "Try CodeSphere, the platform for African developers, by and for devs.",
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
