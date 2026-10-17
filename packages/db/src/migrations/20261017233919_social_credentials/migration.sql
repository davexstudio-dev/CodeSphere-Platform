CREATE TABLE "social_connect_attempt" (
	"state" text PRIMARY KEY,
	"platform" text NOT NULL,
	"sealed_verifier" text NOT NULL,
	"requested_by" text NOT NULL,
	"expires_at" timestamp(3) NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_credential" (
	"platform" text PRIMARY KEY,
	"sealed" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"account_id" text NOT NULL,
	"account_name" text NOT NULL,
	"expires_at" timestamp(3),
	"status" text DEFAULT 'connected' NOT NULL,
	"connected_by" text,
	"connected_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_credential_lock" (
	"key" text PRIMARY KEY,
	"token" text NOT NULL,
	"expires_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_connect_attempt" ADD CONSTRAINT "social_connect_attempt_requested_by_user_id_fkey" FOREIGN KEY ("requested_by") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "social_credential" ADD CONSTRAINT "social_credential_connected_by_user_id_fkey" FOREIGN KEY ("connected_by") REFERENCES "user"("id") ON DELETE SET NULL;