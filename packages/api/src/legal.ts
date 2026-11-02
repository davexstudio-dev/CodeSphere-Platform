import { LEGAL_DOCUMENTS, type LegalDocument } from "@codesphere/contract";
import { LEGAL_LANGUAGES } from "@codesphere/db/schema/legal";
import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import {
	legalDocumentDraft,
	legalDocumentVersion,
} from "@codesphere/db/schema/legal";
import { and, desc, eq, sql } from "drizzle-orm";

import { withAudit } from "./audit";
import { sanitizeMarkdown } from "./markdown/sanitizer";

/**
 * The legal documents edited from the back-office (#341). A publication copies the shared draft into
 * a new immutable version, with its audit event, in ONE statement (the Worker's database has no
 * transactions). Two Admins editing the same draft meet a version check: the second save or
 * publication is a CONFLICT.
 */

type Language = (typeof LEGAL_LANGUAGES)[number];
type Key = { document: LegalDocument; language: Language };

const iso = (value: Date | string) => new Date(value).toISOString();

/** The rows of a document and language, in the versions or in the drafts. */
const forKey = (
	table: typeof legalDocumentVersion | typeof legalDocumentDraft,
	key: Key,
) => and(eq(table.document, key.document), eq(table.language, key.language));

/** A save or a publication that lost against another Admin: where the draft stands now. */
const conflictOf = async (db: Database, key: Key) =>
	({
		ok: false,
		code: "CONFLICT",
		version: (await getDraft(db, key)).version,
	}) as const;

const isUniqueViolation = (error: unknown): boolean => {
	const { code, cause } = (error ?? {}) as { code?: unknown; cause?: unknown };
	return code === "23505" || (cause !== undefined && isUniqueViolation(cause));
};

/** The version in force of a document and language, rendered for the public page. */
export async function publishedText(db: Database, key: Key) {
	const [row] = await db
		.select({
			version: legalDocumentVersion.version,
			publishedAt: legalDocumentVersion.publishedAt,
			content: legalDocumentVersion.content,
		})
		.from(legalDocumentVersion)
		.where(forKey(legalDocumentVersion, key))
		.orderBy(desc(legalDocumentVersion.version))
		.limit(1);
	return row
		? {
				version: row.version,
				publishedAt: iso(row.publishedAt),
				html: sanitizeMarkdown(row.content).html,
			}
		: null;
}

export async function getDraft(db: Database, key: Key) {
	const [row] = await db
		.select({
			content: legalDocumentDraft.content,
			version: legalDocumentDraft.version,
			updatedAt: legalDocumentDraft.updatedAt,
			updatedByName: user.name,
		})
		.from(legalDocumentDraft)
		.innerJoin(user, eq(user.id, legalDocumentDraft.updatedBy))
		.where(forKey(legalDocumentDraft, key));
	return {
		...key,
		content: row?.content ?? null,
		version: row?.version ?? 0,
		updatedAt: row ? iso(row.updatedAt) : null,
		updatedByName: row?.updatedByName ?? null,
	};
}

export type SaveOutcome =
	| { ok: true; draft: Awaited<ReturnType<typeof getDraft>> }
	| { ok: false; code: "CONFLICT"; version: number };

/** Saves the shared draft if nobody saved it since `expectedVersion` (0 when there was none). */
export async function saveDraft(
	db: Database,
	actorId: string,
	input: Key & { content: string; expectedVersion: number },
): Promise<SaveOutcome> {
	const { document, language, content, expectedVersion } = input;
	const written =
		expectedVersion === 0
			? await db
					.insert(legalDocumentDraft)
					.values({ document, language, content, updatedBy: actorId })
					.onConflictDoNothing()
					.returning({ version: legalDocumentDraft.version })
			: await db
					.update(legalDocumentDraft)
					.set({
						content,
						version: sql`${legalDocumentDraft.version} + 1`,
						updatedAt: new Date(),
						updatedBy: actorId,
					})
					.where(
						and(
							eq(legalDocumentDraft.document, document),
							eq(legalDocumentDraft.language, language),
							eq(legalDocumentDraft.version, expectedVersion),
						),
					)
					.returning({ version: legalDocumentDraft.version });
	if (written.length === 0) {
		return conflictOf(db, { document, language });
	}
	return { ok: true, draft: await getDraft(db, { document, language }) };
}

export type PublishOutcome =
	| { ok: true; version: NonNullable<Awaited<ReturnType<typeof getVersion>>> }
	| { ok: false; code: "NOT_FOUND" }
	| { ok: false; code: "CONFLICT"; version: number };

/**
 * Publishes the draft as the next version. The insert reads the draft with the version check in its
 * WHERE: a stale `expectedVersion` (or no draft) inserts nothing and writes no audit event. The audit
 * event names the document, the language and the reason, never the text.
 */
export async function publishDraft(
	db: Database,
	actorId: string,
	input: Key & { expectedVersion: number; reason: string; important: boolean },
): Promise<PublishOutcome> {
	const { document, language, expectedVersion, reason, important } = input;
	let rows: Record<string, unknown>[];
	try {
		rows = await withAudit(
			db,
			{
				actorId,
				action: "legal.publish",
				targetType: "legal_document",
				targetIdColumn: "id",
				details: { document, language, reason },
			},
			sql`INSERT INTO legal_document_version
					(document, language, version, content, reason, important, published_by)
				SELECT d.document, d.language,
					COALESCE((SELECT max(v.version) FROM legal_document_version v
						WHERE v.document = d.document AND v.language = d.language), 0) + 1,
					d.content, ${reason}, ${important}, ${actorId}
				FROM legal_document_draft d
				WHERE d.document = ${document} AND d.language = ${language}
					AND d.version = ${expectedVersion}
				RETURNING id, version`,
		);
	} catch (error) {
		// Two publications raced for the same number: the other one won.
		if (!isUniqueViolation(error)) {
			throw error;
		}
		return conflictOf(db, { document, language });
	}
	const created = rows[0];
	if (!created) {
		const conflict = await conflictOf(db, { document, language });
		return conflict.version === 0 ? { ok: false, code: "NOT_FOUND" } : conflict;
	}
	const version = await getVersion(db, {
		document,
		language,
		version: Number(created.version),
	});
	return version ? { ok: true, version } : { ok: false, code: "NOT_FOUND" };
}

const versionColumns = {
	document: legalDocumentVersion.document,
	language: legalDocumentVersion.language,
	version: legalDocumentVersion.version,
	content: legalDocumentVersion.content,
	reason: legalDocumentVersion.reason,
	important: legalDocumentVersion.important,
	publishedAt: legalDocumentVersion.publishedAt,
	publishedByName: user.name,
};

const withIsoDate = <T extends { publishedAt: Date }>(row: T) => ({
	...row,
	publishedAt: iso(row.publishedAt),
});

/** One published version, with its text. */
export async function getVersion(
	db: Database,
	input: Key & { version: number },
) {
	const [row] = await db
		.select(versionColumns)
		.from(legalDocumentVersion)
		.leftJoin(user, eq(user.id, legalDocumentVersion.publishedBy))
		.where(
			and(
				forKey(legalDocumentVersion, input),
				eq(legalDocumentVersion.version, input.version),
			),
		);
	return row ? withIsoDate(row) : null;
}

/** Every publication of a document and language, newest first, without the texts. */
export async function history(db: Database, key: Key) {
	const {
		content: _content,
		document: _d,
		language: _l,
		...columns
	} = versionColumns;
	const rows = await db
		.select(columns)
		.from(legalDocumentVersion)
		.leftJoin(user, eq(user.id, legalDocumentVersion.publishedBy))
		.where(forKey(legalDocumentVersion, key))
		.orderBy(desc(legalDocumentVersion.version));
	return rows.map(withIsoDate);
}

/** Where each document and language stand: the version in force and the state of the draft. */
export async function overview(db: Database) {
	const { content: _content, document, language, ...columns } = versionColumns;
	const [published, drafts] = await Promise.all([
		db
			.selectDistinctOn(
				[legalDocumentVersion.document, legalDocumentVersion.language],
				{ document, language, ...columns },
			)
			.from(legalDocumentVersion)
			.leftJoin(user, eq(user.id, legalDocumentVersion.publishedBy))
			.orderBy(
				legalDocumentVersion.document,
				legalDocumentVersion.language,
				desc(legalDocumentVersion.version),
			),
		db
			.select({
				document: legalDocumentDraft.document,
				language: legalDocumentDraft.language,
				version: legalDocumentDraft.version,
				updatedAt: legalDocumentDraft.updatedAt,
			})
			.from(legalDocumentDraft),
	]);
	const keys = LEGAL_DOCUMENTS.flatMap((document) =>
		LEGAL_LANGUAGES.map((language) => ({ document, language })),
	);
	return keys.map((key) => {
		const row = published.find(
			(p) => p.document === key.document && p.language === key.language,
		);
		const draft = drafts.find(
			(d) => d.document === key.document && d.language === key.language,
		);
		return {
			...key,
			published: row
				? {
						version: row.version,
						publishedAt: iso(row.publishedAt),
						publishedByName: row.publishedByName,
						reason: row.reason,
						important: row.important,
					}
				: null,
			draftVersion: draft?.version ?? 0,
			draftUpdatedAt: draft ? iso(draft.updatedAt) : null,
		};
	});
}
