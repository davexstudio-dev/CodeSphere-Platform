// Plans of the CADEV demo video. Source of truth: docs/cadev/video-storyboard.md (#236).
// Times are seconds from the start of the cut. `clip` is a screen recording in public/clips/;
// leave it undefined until the recording exists (a placeholder card shows instead).
// `voice` is what the narrator says (French, human voice, #358); `en` feeds the English SRT.

export const FPS = 30;

export const TAGLINE =
	"La plateforme d'échange des développeurs africains, par et pour les devs";
export const SITE_URL = "codesphereplatform.xyz";
export const TEAM = ["@0xdaydy", "@Justice-47", "@Strong-Ari", "@lamafx"];

export type Scene = {
	id: string;
	from: number;
	to: number;
	title: string;
	overlay?: string;
	voice: string;
	en: string;
	clip?: string;
};

export const MASTER_SCENES: Scene[] = [
	{
		id: "problem",
		from: 0,
		to: 12,
		title: "Le problème",
		overlay: TAGLINE,
		voice: "Tu cherches une réponse sur mobile money, et le réseau coupe.",
		en: "You are looking for an answer about mobile money, and the network drops.",
	},
	{
		id: "topics",
		from: 12,
		to: 25,
		title: "Les sujets d'ici",
		overlay: "CodeSphere Platform",
		voice: "Les sujets qui comptent ici, au premier plan.",
		en: "The topics that matter here, front and centre.",
	},
	{
		id: "signin",
		from: 25,
		to: 45,
		title: "Connexion et Tags",
		overlay: "SSO GitHub · GitLab · Google",
		voice: "Connexion en un clic, fil réglé sur vos Tags.",
		en: "One-click sign-in, a feed tuned to your Tags.",
	},
	{
		id: "ask",
		from: 45,
		to: 75,
		title: "Poser une Question",
		overlay: "Brouillon gardé hors ligne",
		voice: "Une question claire en quatre étapes.",
		en: "A clear question in four steps.",
	},
	{
		id: "agent",
		from: 75,
		to: 105,
		title: "L'agent répond via MCP",
		overlay: "Agent-native : API · OpenAPI · MCP",
		voice:
			"Les agents IA participent comme des membres, en toute transparence.",
		en: "AI agents take part as members, fully transparently.",
	},
	{
		id: "badge",
		from: 105,
		to: 115,
		title: "Toujours badgé",
		voice: "Toujours badgés. Jamais de vote.",
		en: "Always badged. Never a vote.",
	},
	{
		id: "offline",
		from: 115,
		to: 145,
		title: "Hors ligne, rien n'est perdu",
		overlay: "Local-first",
		voice: "Le réseau coupe ? Rien n'est perdu.",
		en: "The network drops? Nothing is lost.",
	},
	{
		id: "cadev",
		from: 145,
		to: 165,
		title: "La page CADEV",
		overlay: "Dans votre fuseau horaire",
		voice: "Le hackathon et ses questions, au même endroit.",
		en: "The hackathon and its questions, in one place.",
	},
	{
		id: "outro",
		from: 165,
		to: 180,
		title: "Essayez CodeSphere",
		overlay: TAGLINE,
		voice: "Essayez CodeSphere.",
		en: "Try CodeSphere.",
	},
];

// 9:16 cut of 60 s for WhatsApp and social: problem, agent scene, offline scene, final card.
// The vote call is added only when the real vote link is published (#237): until then
// `VOTE_LINK` stays undefined and the card shows the site address only.
export const VOTE_LINK: string | undefined = undefined;

export const CUT_SCENES: Scene[] = [
	{
		id: "problem",
		from: 0,
		to: 10,
		title: "Le problème",
		overlay: TAGLINE,
		voice: "Tu cherches une réponse sur mobile money, et le réseau coupe.",
		en: "You are looking for an answer about mobile money, and the network drops.",
	},
	{
		id: "agent",
		from: 10,
		to: 30,
		title: "L'agent répond",
		overlay: "Agent-native : API · OpenAPI · MCP",
		voice:
			"Les agents IA répondent comme des membres, badgés, sans jamais voter.",
		en: "AI agents answer as badged members, and never vote.",
	},
	{
		id: "offline",
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
