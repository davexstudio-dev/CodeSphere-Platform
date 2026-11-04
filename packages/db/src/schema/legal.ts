import { LEGAL_DOCUMENTS } from "@codesphere/contract/legal";
import {
	boolean,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

// The legal documents edited from the back-office (#341). A document has one text per language.

/** The languages a document is written in. */
export const LEGAL_LANGUAGES = ["fr", "en"] as const;

// A published version: immutable, one row per publication. The version in force of a document and
// language is the highest `version`. Never updated nor deleted by the application.
export const legalDocumentVersion = pgTable(
	"legal_document_version",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		document: text("document", { enum: LEGAL_DOCUMENTS }).notNull(),
		language: text("language", { enum: LEGAL_LANGUAGES }).notNull(),
		// 1, 2, 3... per document and language. A race between two publications trips the unique index.
		version: integer("version").notNull(),
		content: text("content").notNull(),
		// Why it changed: visible in the back-office history, never to the public.
		reason: text("reason").notNull(),
		// « Modification importante »: asks the Members (terms, privacy) or the Organizations (their
		// terms) to accept again. The counters in force are the number of such publications + 1.
		important: boolean("important").default(false).notNull(),
		publishedAt: timestamp("published_at", { precision: 3 })
			.defaultNow()
			.notNull(),
		publishedBy: text("published_by")
			.notNull()
			.references(() => user.id),
	},
	(t) => [
		uniqueIndex("legal_document_version_unique_idx").on(
			t.document,
			t.language,
			t.version,
		),
	],
);

// The text being prepared: one shared draft per document and language, never public. `version` counts
// its saves and guards concurrent edits (a stale save is a CONFLICT).
export const legalDocumentDraft = pgTable(
	"legal_document_draft",
	{
		document: text("document", { enum: LEGAL_DOCUMENTS }).notNull(),
		language: text("language", { enum: LEGAL_LANGUAGES }).notNull(),
		content: text("content").notNull(),
		version: integer("version").default(1).notNull(),
		updatedAt: timestamp("updated_at", { precision: 3 }).defaultNow().notNull(),
		updatedBy: text("updated_by")
			.notNull()
			.references(() => user.id),
	},
	(t) => [primaryKey({ columns: [t.document, t.language] })],
);
