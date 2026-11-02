/** @jsxImportSource react */
import { Link, Text } from "@react-email/components";

import { DEFAULT_LOCALE, type Locale } from "../locale";
import { Layout, paragraph } from "./layout";

export type HackathonUnpublishedProps = {
	name: string;
	hackathonName: string;
	organizationName: string;
	/** The reason the Admin recorded, shown as written. */
	reason: string;
	/** The Organization space. Omitted when the site address is unknown. */
	url?: string;
	locale?: Locale;
};

export const HACKATHON_UNPUBLISHED_SUBJECTS: Record<Locale, string> = {
	fr: "Un de vos Hackathons a été dépublié",
	en: "One of your Hackathons was unpublished",
};

const COPY: Record<
	Locale,
	{
		preview: string;
		title: string;
		body: (name: string, hackathon: string, org: string) => string;
		reason: string;
		steps: string;
		link: string;
	}
> = {
	fr: {
		preview: "Un Hackathon est repassé en brouillon",
		title: "Hackathon dépublié",
		body: (name, hackathon, org) =>
			`Bonjour ${name}, un administrateur a dépublié le Hackathon « ${hackathon} » de ${org} : il est repassé en brouillon et n'est plus public.`,
		reason: "Motif :",
		steps:
			"Pour demander la levée du blocage : corrigez le contenu dans l'espace de l'Organisation, puis écrivez à l'équipe de la plateforme en indiquant le nom du Hackathon. Un administrateur lèvera le blocage, et vous pourrez le publier de nouveau.",
		link: "Ouvrir l'espace de l'Organisation",
	},
	en: {
		preview: "A Hackathon went back to draft",
		title: "Hackathon unpublished",
		body: (name, hackathon, org) =>
			`Hello ${name}, an administrator unpublished the Hackathon "${hackathon}" of ${org}: it is back to a draft and no longer public.`,
		reason: "Reason:",
		steps:
			"To ask for the lock to be lifted: fix the content in the Organization space, then write to the platform team with the name of the Hackathon. An administrator will lift the lock, and you will be able to publish it again.",
		link: "Open the Organization space",
	},
};

export function HackathonUnpublished({
	name,
	hackathonName,
	organizationName,
	reason,
	url,
	locale = DEFAULT_LOCALE,
}: HackathonUnpublishedProps) {
	const copy = COPY[locale];
	return (
		<Layout locale={locale} preview={copy.preview} title={copy.title}>
			<Text style={paragraph}>
				{copy.body(name, hackathonName, organizationName)}
			</Text>
			<Text style={paragraph}>
				{copy.reason} {reason}
			</Text>
			<Text style={paragraph}>{copy.steps}</Text>
			{url ? (
				<Text style={paragraph}>
					<Link href={url}>{copy.link}</Link>
				</Text>
			) : null}
		</Layout>
	);
}
