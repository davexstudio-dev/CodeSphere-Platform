CREATE TABLE "reputation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"points" integer NOT NULL,
	"cause" text NOT NULL,
	"actor_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "reputation_events_user_idx" ON "reputation_events" ("user_id");--> statement-breakpoint
CREATE INDEX "reputation_events_source_idx" ON "reputation_events" ("cause","actor_id","target_type","target_id");--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_actor_id_user_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id");