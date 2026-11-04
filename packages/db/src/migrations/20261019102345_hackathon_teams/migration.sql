CREATE TABLE "hackathon_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"team_id" uuid NOT NULL UNIQUE,
	"hackathon_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"description_html" text NOT NULL,
	"repo_url" text NOT NULL,
	"demo_url" text NOT NULL,
	"video_url" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"early_commit_flag" boolean DEFAULT false NOT NULL,
	"early_commit_at" timestamp(3),
	"checked_at" timestamp(3),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hackathon_team_invites" (
	"team_id" uuid,
	"user_id" text,
	"invited_by" text NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "hackathon_team_invites_pkey" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "hackathon_team_members" (
	"team_id" uuid,
	"hackathon_id" uuid NOT NULL,
	"user_id" text,
	"joined_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "hackathon_team_members_pkey" PRIMARY KEY("team_id","user_id"),
	CONSTRAINT "hackathon_team_members_one_team" UNIQUE("hackathon_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "hackathon_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"hackathon_id" uuid NOT NULL,
	"name" text NOT NULL,
	"captain_id" text NOT NULL,
	"invite_token" text NOT NULL UNIQUE,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "hackathon_teams_name" UNIQUE("hackathon_id","name")
);
--> statement-breakpoint
ALTER TABLE "hackathon" ADD COLUMN "opens_at" timestamp;--> statement-breakpoint
CREATE INDEX "hackathon_teams_hackathon_idx" ON "hackathon_teams" ("hackathon_id");--> statement-breakpoint
ALTER TABLE "hackathon_submissions" ADD CONSTRAINT "hackathon_submissions_team_id_hackathon_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "hackathon_teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hackathon_submissions" ADD CONSTRAINT "hackathon_submissions_hackathon_id_hackathon_id_fkey" FOREIGN KEY ("hackathon_id") REFERENCES "hackathon"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hackathon_team_invites" ADD CONSTRAINT "hackathon_team_invites_team_id_hackathon_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "hackathon_teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hackathon_team_invites" ADD CONSTRAINT "hackathon_team_invites_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "hackathon_team_invites" ADD CONSTRAINT "hackathon_team_invites_invited_by_user_id_fkey" FOREIGN KEY ("invited_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "hackathon_team_members" ADD CONSTRAINT "hackathon_team_members_team_id_hackathon_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "hackathon_teams"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hackathon_team_members" ADD CONSTRAINT "hackathon_team_members_hackathon_id_hackathon_id_fkey" FOREIGN KEY ("hackathon_id") REFERENCES "hackathon"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hackathon_team_members" ADD CONSTRAINT "hackathon_team_members_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "hackathon_teams" ADD CONSTRAINT "hackathon_teams_hackathon_id_hackathon_id_fkey" FOREIGN KEY ("hackathon_id") REFERENCES "hackathon"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hackathon_teams" ADD CONSTRAINT "hackathon_teams_captain_id_user_id_fkey" FOREIGN KEY ("captain_id") REFERENCES "user"("id");