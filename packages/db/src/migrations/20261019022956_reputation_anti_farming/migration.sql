ALTER TABLE "reputation_events" ADD COLUMN "voided_reason" text;--> statement-breakpoint
CREATE INDEX "reputation_events_voided_idx" ON "reputation_events" ("voided_reason","created_at");