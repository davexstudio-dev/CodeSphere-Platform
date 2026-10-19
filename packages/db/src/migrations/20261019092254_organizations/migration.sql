CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"website" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"country" text NOT NULL,
	"contact_email" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"status_reason" text,
	"owner_id" text,
	"reviewed_by" text,
	"reviewed_at" timestamp(3),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"system" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hackathon" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
CREATE INDEX "organization_status_idx" ON "organization" ("status");--> statement-breakpoint
CREATE INDEX "organization_owner_idx" ON "organization" ("owner_id");--> statement-breakpoint
ALTER TABLE "hackathon" ADD CONSTRAINT "hackathon_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id");--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "user"("id");--> statement-breakpoint
-- #257: the free-text organizer of each Hackathon becomes a validated Organization the platform
-- created itself (no owner, no contact email), and the Hackathon points at it.
INSERT INTO "organization" ("slug", "name", "website", "country", "status", "system", "reviewed_at")
SELECT DISTINCT ON (s.slug) s.slug, s.name, s.website, 'OTHER', 'validated', true, now()
FROM (
	SELECT
		trim(both '-' from lower(regexp_replace(trim("organizer"), '[^a-zA-Z0-9]+', '-', 'g'))) AS slug,
		trim("organizer") AS name,
		regexp_replace("source_url", '^(https?://[^/]+).*$', '\1') AS website
	FROM "hackathon"
) s
WHERE s.slug <> ''
ORDER BY s.slug
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
UPDATE "hackathon" h SET "organization_id" = o."id"
FROM "organization" o
WHERE o."slug" = trim(both '-' from lower(regexp_replace(trim(h."organizer"), '[^a-zA-Z0-9]+', '-', 'g')));
