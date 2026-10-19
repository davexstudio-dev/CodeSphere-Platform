ALTER TABLE "organization" ADD COLUMN "validated_at" timestamp(3);
-- Those validated before this column existed (the migrated organizers): validated at their review.
UPDATE "organization" SET "validated_at" = "reviewed_at" WHERE "status" = 'validated' AND "validated_at" IS NULL;
