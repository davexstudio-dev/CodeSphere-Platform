/** @jsxImportSource react */
import { Link, Text } from "@react-email/components";

import { DEFAULT_LOCALE, type Locale } from "../locale";
import { Layout, paragraph } from "./layout";

export type OrganizationSuspendedProps = {
	name: string;
	organizationName: string;
	/** The reason the Admin recorded, shown as written. Omitted when none was given. */
	reason?: string;
	/** The contact address of the legal page. Omitted when it is not configured. */
	contactEmail?: string;
	locale?: Locale;
};

export const ORGANIZATION_SUSPENDED_SUBJECTS: Record<Locale, string> = {
	fr: "Votre Organisation est suspendue sur CodeSphere Platform",
	en: "Your Organization is suspended on CodeSphere Platform",
};

const COPY: Record<
	Locale,
	{
		preview: string;
		title: string;
		body: (name: string, org: string) => string;
		reason: string;
		contact: string;
	}
> = {
	fr: {
		preview: "Une Organisation a été suspendue par un administrateur",
		title: "Organisation suspendue",
		body: (name, org) =>
			`Bonjour ${name}, l'Organisation ${org} a été suspendue par un administrateur : ses pages ne sont plus publiques et son espace n'est plus accessible.`,
		reason: "Motif :",
		contact: "Pour contester cette décision, écrivez-nous à",
	},
	en: {
		preview: "An Organization was suspended by an administrator",
		title: "Organization suspended",
		body: (name, org) =>
			`Hello ${name}, the Organization ${org} was suspended by an administrator: its pages are no longer public and its space is no longer reachable.`,
		reason: "Reason:",
		contact: "To contest this decision, write to us at",
	},
};

export function OrganizationSuspended({
	name,
	organizationName,
	reason,
	contactEmail,
	locale = DEFAULT_LOCALE,
}: OrganizationSuspendedProps) {
	const copy = COPY[locale];
	return (
		<Layout locale={locale} preview={copy.preview} title={copy.title}>
			<Text style={paragraph}>{copy.body(name, organizationName)}</Text>
			{reason ? (
				<Text style={paragraph}>
					{copy.reason} {reason}
				</Text>
			) : null}
			{contactEmail ? (
				<Text style={paragraph}>
					{copy.contact}{" "}
					<Link href={`mailto:${contactEmail}`}>{contactEmail}</Link>.
				</Text>
			) : null}
		</Layout>
	);
}
