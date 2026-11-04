CREATE TABLE "community_snapshots" (
	"day" text PRIMARY KEY,
	"computed_at" timestamp(3) DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL
);
