DO $$ BEGIN
	IF EXISTS (SELECT 1 FROM "hackathon" WHERE "organization_id" IS NULL) THEN
		RAISE EXCEPTION 'a Hackathon has no Organization: the organizer is kept until it is linked';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "hackathon" DROP COLUMN "organizer";--> statement-breakpoint
ALTER TABLE "hackathon" ALTER COLUMN "organization_id" SET NOT NULL;