ALTER TABLE "hackathon" ADD COLUMN "teams_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- The CADEV registers and collects submissions on Systalink's Datacloud: its teams are not run
-- here. An Admin can turn them back on from the back-office.
UPDATE "hackathon" SET "teams_enabled" = false WHERE "slug" = 'cadev-2026';
