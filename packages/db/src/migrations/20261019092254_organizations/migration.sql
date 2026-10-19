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
-- created itself (no owner, no contact email), and the Hackathon points at it. The slug is the
-- name without accents or punctuation (the same form `slugify` computes in TypeScript); a name with
-- nothing usable left falls back to the Hackathon's id, so every Hackathon gets an Organization.
CREATE FUNCTION pg_temp.org_slug(organizer text, hackathon_id uuid) RETURNS text AS $$
	SELECT COALESCE(
		NULLIF(trim(both '-' from regexp_replace(
			translate(lower(trim(organizer)), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'),
			'[^a-z0-9]+', '-', 'g')), ''),
		'organization-' || left(hackathon_id::text, 8)
	)
$$ LANGUAGE sql IMMUTABLE;
--> statement-breakpoint
INSERT INTO "organization" ("slug", "name", "website", "country", "status", "system", "reviewed_at")
SELECT DISTINCT ON (s.slug) s.slug, s.name, s.website, 'OTHER', 'validated', true, now()
FROM (
	SELECT
		pg_temp.org_slug("organizer", "id") AS slug,
		trim("organizer") AS name,
		regexp_replace("source_url", '^(https?://[^/]+).*$', '\1') AS website
	FROM "hackathon"
) s
ORDER BY s.slug
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
UPDATE "hackathon" h SET "organization_id" = o."id"
FROM "organization" o
WHERE o."slug" = pg_temp.org_slug(h."organizer", h."id");
