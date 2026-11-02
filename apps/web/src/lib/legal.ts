import type { LegalDocument } from "@codesphere/contract";

// Legal pages (spec §4, #56), reached from the footer and from the consent box at sign-in.
export const LEGAL_PAGES = ["terms", "privacy", "notice", "contact"] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

/**
 * Date of the texts of the repository (`messages/<locale>.json`), shown while no version of a
 * document is published in the reader's language (#341). Once one is, its publication date is shown.
 */
export const REPOSITORY_LEGAL_DATE = "2026-10-14";

/** The consent and Organization terms versions before any important change is published. */
export const DEFAULT_CONSENT_VERSION = "1";

/** How long a browser may keep a legal page (#341): the text is read from the database per request. */
export const LEGAL_PAGE_MAX_AGE_SECONDS = 300;

export function isLegalPage(value: string): value is LegalPage {
	return LEGAL_PAGES.some((page) => page === value);
}

/** The login card links to `/legal/terms` and `/legal/privacy` by default. */
export function legalHref(page: LegalPage): string {
	return `/legal/${page}`;
}

type PageMessages = {
	intro: string;
	sections: Record<string, { title: string; body: string }>;
};

/** A legal page of the repository as Markdown: the first draft of the editor (#341). */
export function pageMarkdown({ intro, sections }: PageMessages): string {
	return [
		intro,
		...Object.values(sections).map(
			(section) => `## ${section.title}\n\n${section.body}`,
		),
	].join("\n\n");
}

type TermsMessages = { intro: string; clauses: Record<string, string> };

/** The Organization terms of the repository as Markdown: a sentence and a list of clauses. */
export function organizationTermsMarkdown({
	intro,
	clauses,
}: TermsMessages): string {
	return [
		intro,
		Object.values(clauses)
			.map((clause) => `- ${clause}`)
			.join("\n"),
	].join("\n\n");
}

type RepositoryMessages = {
	legal: { pages: Record<string, PageMessages> };
	organizations: { manage: { terms: TermsMessages } };
};

/** The text of the repository for a document, in the language of `messages`. */
export function repositoryMarkdown(
	document: LegalDocument,
	messages: RepositoryMessages,
): string {
	if (document === "organization_terms") {
		return organizationTermsMarkdown(messages.organizations.manage.terms);
	}
	const page = messages.legal.pages[document];
	return page ? pageMarkdown(page) : "";
}
