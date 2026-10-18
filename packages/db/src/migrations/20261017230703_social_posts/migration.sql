CREATE TABLE "social_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"idempotency_key" text NOT NULL UNIQUE,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"platform" text NOT NULL,
	"state" text NOT NULL,
	"text" text NOT NULL,
	"post_url" text,
	"message" text,
	"retryable" boolean DEFAULT false NOT NULL,
	"requested_by" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "social_post_target_idx" ON "social_post" ("target_type","target_id");--> statement-breakpoint
ALTER TABLE "social_post" ADD CONSTRAINT "social_post_requested_by_user_id_fkey" FOREIGN KEY ("requested_by") REFERENCES "user"("id") ON DELETE SET NULL;