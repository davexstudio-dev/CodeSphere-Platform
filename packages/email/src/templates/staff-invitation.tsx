/** @jsxImportSource react */
import { Text } from "@react-email/components";

import { DEFAULT_LOCALE, type Locale } from "../locale";
import { Layout, paragraph } from "./layout";

export type StaffInvitationProps = {
	/** Name of the Admin who invited. */
	invitedBy: string;
	role: "moderator" | "admin";
	/** How many days the offer stays open. */
	days: number;
	locale?: Locale;
};

export const STAFF_INVITATION_SUBJECTS: Record<Locale, string> = {
	fr: "Vous êtes invité à rejoindre l'équipe CodeSphere Platform",
	en: "You are invited to join the CodeSphere Platform team",
};

const ROLE: Record<Locale, Record<StaffInvitationProps["role"], string>> = {
	fr: { moderator: "modérateur", admin: "administrateur" },
	en: { moderator: "moderator", admin: "admin" },
};

const COPY: Record<
	Locale,
	{
		preview: string;
		title: string;
		body: (by: string, role: string, days: number) => string;
		how: string;
	}
> = {
	fr: {
		preview: "Un rôle d'équipe vous attend",
		title: "Invitation à l'équipe",
		body: (by, role, days) =>
			`${by} vous propose le rôle de ${role} sur CodeSphere Platform. L'offre reste ouverte ${days} jours.`,
		how: "Pour l'accepter, connectez-vous à CodeSphere Platform avec cette adresse e-mail, comme d'habitude : le rôle s'applique à la connexion. Aucun mot de passe à créer.",
	},
	en: {
		preview: "A team role is waiting for you",
		title: "Team invitation",
		body: (by, role, days) =>
			`${by} offers you the ${role} role on CodeSphere Platform. The offer stays open for ${days} days.`,
		how: "To accept it, sign in to CodeSphere Platform with this email address, as usual: the role applies when you sign in. There is no password to create.",
	},
};

export function StaffInvitation({
	invitedBy,
	role,
	days,
	locale = DEFAULT_LOCALE,
}: StaffInvitationProps) {
	const copy = COPY[locale];
	return (
		<Layout locale={locale} preview={copy.preview} title={copy.title}>
			<Text style={paragraph}>
				{copy.body(invitedBy, ROLE[locale][role], days)}
			</Text>
			<Text style={paragraph}>{copy.how}</Text>
		</Layout>
	);
}
