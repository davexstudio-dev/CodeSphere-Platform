CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"dedupe_key" text UNIQUE,
	"created_at" timestamp(6) DEFAULT now() NOT NULL,
	"published_at" timestamp(3),
	"locked_until" timestamp(3),
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"failed_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "outbox_stats" (
	"type" text PRIMARY KEY,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_events" (
	"consumer" text,
	"event_id" uuid,
	"processed_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "processed_events_pkey" PRIMARY KEY("consumer","event_id")
);
--> statement-breakpoint
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events" ("published_at","created_at","id");--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" ("aggregate_type","aggregate_id");