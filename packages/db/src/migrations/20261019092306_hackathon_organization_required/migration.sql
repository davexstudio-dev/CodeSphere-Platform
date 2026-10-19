ALTER TABLE "hackathon" DROP COLUMN "organizer";--> statement-breakpoint
ALTER TABLE "hackathon" ALTER COLUMN "organization_id" SET NOT NULL;