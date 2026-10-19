ALTER TABLE "hackathon_teams" ADD COLUMN "member_count" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
-- Teams that already had members: the counter starts at the real count.
UPDATE "hackathon_teams" t SET "member_count" = (SELECT count(*) FROM "hackathon_team_members" m WHERE m."team_id" = t."id");
