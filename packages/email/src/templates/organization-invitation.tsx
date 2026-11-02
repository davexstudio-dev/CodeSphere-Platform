/** @jsxImportSource react */
import { Link, Text } from "@react-email/components";

import { DEFAULT_LOCALE, type Locale } from "../locale";
import { Layout, paragraph } from "./layout";

export type OrganizationInvitationProps = {
	name: string;
	/** The owner who invited; null when that account no longer exists. */
	invitedBy: string | null;
	organizationName: string;
	/** `editor` joins the team; `owner` is an offer to take over the management. */
	role: "editor" | "owner";
	/** Where the invitations received are listed. Omitted when the site address is unknown. */
	url?: string;
	locale?: Locale;
};

export const ORGANIZATION_INVITATION_SUBJECTS: Record<Locale, string> = {
	fr: "Une Organisation vous invite sur CodeSphere Platform",
	en: "An Organization invites you on CodeSphere Platform",
};

const COPY: Record<
	Locale,
	{
		preview: string;
		title: string;
		body: (
			name: string,
			by: string | null,
			org: string,
			role: "editor" | "owner",
		) => string;
		how: string;
		link: string;
	}
> = {
	fr: {
		preview: "Vous avez une invitation en attente",
		title: "Invitation d'une Organisation",
		body: (name, by, org, role) => {
			const who = by ?? "Le responsable";
			return role === "owner"
				? `Bonjour ${name}, ${who} vous propose de devenir le responsable de ${org}.`
				: `Bonjour ${name}, ${who} vous invite à rejoindre l'équipe de ${org} comme éditeur.`;
		},
		how: "Vous pouvez accepter ou refuser depuis la page des invitations reçues. Sans réponse de votre part, rien ne change.",
		link: "Voir mes invitations",
	},
	en: {
		preview: "You have an invitation waiting",
		title: "Invitation from an Organization",
		body: (name, by, org, role) => {
			const who = by ?? "The owner";
			return role === "owner"
				? `Hello ${name}, ${who} offers you to become the owner of ${org}.`
				: `Hello ${name}, ${who} invites you to join the team of ${org} as an editor.`;
		},
		how: "You can accept or decline from the page listing the invitations you received. If you do nothing, nothing changes.",
		link: "See my invitations",
	},
};

export function OrganizationInvitation({
	name,
	invitedBy,
	organizationName,
	role,
	url,
	locale = DEFAULT_LOCALE,
}: OrganizationInvitationProps) {
	const copy = COPY[locale];
	return (
		<Layout locale={locale} preview={copy.preview} title={copy.title}>
			<Text style={paragraph}>
				{copy.body(name, invitedBy, organizationName, role)}
			</Text>
			<Text style={paragraph}>{copy.how}</Text>
			{url ? (
				<Text style={paragraph}>
					<Link href={url}>{copy.link}</Link>
				</Text>
			) : null}
		</Layout>
	);
}
