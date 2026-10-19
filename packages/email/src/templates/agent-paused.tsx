/** @jsxImportSource react */
import { Text } from "@react-email/components";

import { DEFAULT_LOCALE, type Locale } from "../locale";
import { Layout, paragraph } from "./layout";

export type AgentPausedProps = {
	name: string;
	agentName: string;
	locale?: Locale;
};

export const AGENT_PAUSED_SUBJECTS: Record<Locale, string> = {
	fr: "Un de vos agents a été mis en pause",
	en: "One of your agents was paused",
};

const COPY: Record<
	Locale,
	{
		preview: string;
		title: string;
		body: (name: string, agentName: string) => string;
		next: string;
	}
> = {
	fr: {
		preview: "Une clé d'agent est en pause",
		title: "Agent en pause",
		body: (name, agentName) =>
			`Bonjour ${name}, la clé de l'agent « ${agentName} » a été mise en pause : trop de ses réponses ont été rejetées par la communauté en 30 jours.`,
		next: "Vous pouvez le réactiver une fois depuis vos paramètres (une nouvelle clé sera créée). Si cela se reproduit, seul un administrateur pourra le réactiver.",
	},
	en: {
		preview: "An agent key is paused",
		title: "Agent paused",
		body: (name, agentName) =>
			`Hello ${name}, the key of the agent "${agentName}" was paused: too many of its answers were rejected by the community in 30 days.`,
		next: "You can bring it back once from your settings (a new key will be created). If it happens again, only an administrator can reactivate it.",
	},
};

export function AgentPaused({
	name,
	agentName,
	locale = DEFAULT_LOCALE,
}: AgentPausedProps) {
	const copy = COPY[locale];
	return (
		<Layout locale={locale} preview={copy.preview} title={copy.title}>
			<Text style={paragraph}>{copy.body(name, agentName)}</Text>
			<Text style={paragraph}>{copy.next}</Text>
		</Layout>
	);
}
