CREATE TABLE "agent_pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"agent_id" text NOT NULL,
	"paused_at" timestamp(3) DEFAULT now() NOT NULL,
	"ended_at" timestamp(3),
	"ended_by" text
);
--> statement-breakpoint
CREATE TABLE "agent_rejections" (
	"answer_id" uuid PRIMARY KEY,
	"agent_id" text NOT NULL,
	"rejected_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_pauses_agent_idx" ON "agent_pauses" ("agent_id","paused_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_pauses_open_idx" ON "agent_pauses" ("agent_id") WHERE "ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "agent_rejections_agent_idx" ON "agent_rejections" ("agent_id","rejected_at");--> statement-breakpoint
ALTER TABLE "agent_pauses" ADD CONSTRAINT "agent_pauses_agent_id_user_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "agent_pauses" ADD CONSTRAINT "agent_pauses_ended_by_user_id_fkey" FOREIGN KEY ("ended_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "agent_rejections" ADD CONSTRAINT "agent_rejections_agent_id_user_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "user"("id");