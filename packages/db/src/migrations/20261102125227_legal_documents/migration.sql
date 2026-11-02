CREATE TABLE "legal_document_draft" (
	"document" text,
	"language" text,
	"content" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "legal_document_draft_pkey" PRIMARY KEY("document","language")
);
--> statement-breakpoint
CREATE TABLE "legal_document_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"document" text NOT NULL,
	"language" text NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"reason" text NOT NULL,
	"important" boolean DEFAULT false NOT NULL,
	"published_at" timestamp(3) DEFAULT now() NOT NULL,
	"published_by" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "legal_document_version_unique_idx" ON "legal_document_version" ("document","language","version");--> statement-breakpoint
ALTER TABLE "legal_document_draft" ADD CONSTRAINT "legal_document_draft_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "legal_document_version" ADD CONSTRAINT "legal_document_version_published_by_user_id_fkey" FOREIGN KEY ("published_by") REFERENCES "user"("id");--> statement-breakpoint
-- The consent version and the Organization terms version become counters (#341), starting at 1.
-- What was accepted so far is the text of the repository, which is version 1 of each document: nobody
-- has to accept again when the back-office menu arrives.
UPDATE "user" SET "consent_version" = '1' WHERE "consent_version" = '2026-10';--> statement-breakpoint
UPDATE "organization_terms_acceptance" SET "version" = '1' WHERE "version" = '2026-11-02';