import * as z from "zod";

import { base, Language, Markdown, Timestamp } from "./base";

// Legal documents edited from the back-office (#341). Each document has one text per language,
// published independently. A publication is a new, immutable version; a single shared draft per
// document and language holds the text being prepared.

/** The documents. The first four are the public pages `/legal/<page>`. */
export const LEGAL_DOCUMENTS = [
	"terms",
	"privacy",
	"notice",
	"contact",
	"organization_terms",
] as const;
export const LegalDocument = z.enum(LEGAL_DOCUMENTS);
export type LegalDocument = z.infer<typeof LegalDocument>;

/** The documents whose publication can be flagged « important » and ask for a new acceptance. */
export const CONSENT_DOCUMENTS = [
	"terms",
	"privacy",
	"organization_terms",
] as const;

export const bearsConsent = (document: LegalDocument) =>
	(CONSENT_DOCUMENTS as readonly string[]).includes(document);

/** The documents Members accept at sign-in: an important change of one asks every Member again. */
export const MEMBER_CONSENT_DOCUMENTS = ["terms", "privacy"] as const;

export const isMemberConsentDocument = (document: LegalDocument) =>
	(MEMBER_CONSENT_DOCUMENTS as readonly string[]).includes(document);

/** A publication needs a reason, kept in the history and never shown to the public. */
export const LegalReason = z.string().trim().min(3).max(300);

/** The text of a legal document in force. The reason of its publication stays in the back-office. */
export const LegalPublished = z.object({
	version: z.number().int(),
	publishedAt: Timestamp,
	/** Rendered by the same sanitizing pipeline as a Question: no raw HTML. */
	html: z.string(),
});

/** The version counters in force: what a Member and an Organization have to have accepted. */
export const LegalVersions = z.object({
	consent: z.string(),
	organizationTerms: z.string(),
});

export const LegalDraft = z.object({
	document: LegalDocument,
	language: Language,
	/** Null while nobody saved a draft: the app then offers the text of the repository. */
	content: z.string().nullable(),
	/** 0 while there is no draft; the number to send back as `expectedVersion`. */
	version: z.number().int().min(0),
	updatedAt: Timestamp.nullable(),
	updatedByName: z.string().nullable(),
});

export const LegalVersionSummary = z.object({
	version: z.number().int(),
	publishedAt: Timestamp,
	publishedByName: z.string().nullable(),
	reason: z.string(),
	important: z.boolean(),
});

export const LegalVersionDetail = LegalVersionSummary.extend({
	document: LegalDocument,
	language: Language,
	content: z.string(),
});

/** One row of the overview: where a document and language stand. */
export const LegalOverviewItem = z.object({
	document: LegalDocument,
	language: Language,
	/** Null while nothing is published: the public page shows the text of the repository. */
	published: LegalVersionSummary.nullable(),
	/** 0 while there is no draft. */
	draftVersion: z.number().int().min(0),
	draftUpdatedAt: Timestamp.nullable(),
});

const adminErrors = {
	UNAUTHORIZED: {},
	FORBIDDEN: {},
} as const;

const writeErrors = {
	...adminErrors,
	NOT_FOUND: {},
	CONFLICT: { data: z.object({ version: z.number() }) },
} as const;

export const LegalDraftSave = z.object({
	document: LegalDocument,
	language: Language,
	content: Markdown,
	/** The draft version last seen; 0 when there was no draft. A stale one is a CONFLICT. */
	expectedVersion: z.number().int().min(0),
});

export const LegalPublish = z
	.object({
		document: LegalDocument,
		language: Language,
		/** The draft version being published: someone else saving meanwhile is a CONFLICT. */
		expectedVersion: z.number().int().min(1),
		reason: LegalReason,
		/** Only for the terms, the privacy policy and the Organization terms. */
		important: z.boolean().default(false),
	})
	.refine((input) => !input.important || bearsConsent(input.document), {
		path: ["important"],
		message: "Only the terms, the privacy policy and the Organization terms.",
	});

/** The public read of the texts. Not exposed over REST or MCP: the app reads them. */
export const legalContract = {
	get: base
		.input(z.object({ document: LegalDocument, language: Language }))
		.output(LegalPublished.nullable()),
	versions: base.input(z.object({})).output(LegalVersions),
};

/** The back-office editor of the documents (Admin and super admin). Not exposed over REST or MCP. */
export const legalAdminContract = {
	list: base
		.errors(adminErrors)
		.input(z.object({}))
		.output(z.object({ items: z.array(LegalOverviewItem) })),
	draft: base
		.errors(adminErrors)
		.input(z.object({ document: LegalDocument, language: Language }))
		.output(LegalDraft),
	saveDraft: base.errors(writeErrors).input(LegalDraftSave).output(LegalDraft),
	publish: base
		.errors(writeErrors)
		.input(LegalPublish)
		.output(LegalVersionDetail),
	history: base
		.errors(adminErrors)
		.input(z.object({ document: LegalDocument, language: Language }))
		.output(z.object({ items: z.array(LegalVersionSummary) })),
	version: base
		.errors({ ...adminErrors, NOT_FOUND: {} })
		.input(
			z.object({
				document: LegalDocument,
				language: Language,
				version: z.number().int().min(1),
			}),
		)
		.output(LegalVersionDetail),
};
