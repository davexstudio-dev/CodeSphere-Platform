CREATE TABLE "feed_affinity" (
	"user_id" text,
	"tag" text,
	"weight" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "feed_affinity_pkey" PRIMARY KEY("user_id","tag")
);
--> statement-breakpoint
CREATE TABLE "feed_muted" (
	"user_id" text,
	"kind" text,
	"key" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "feed_muted_pkey" PRIMARY KEY("user_id","kind","key")
);
--> statement-breakpoint
CREATE TABLE "feed_preferences" (
	"user_id" text PRIMARY KEY,
	"personalization" boolean DEFAULT true NOT NULL,
	"language" text,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watch_items" ADD COLUMN "click_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_affinity" ADD CONSTRAINT "feed_affinity_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feed_muted" ADD CONSTRAINT "feed_muted_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feed_preferences" ADD CONSTRAINT "feed_preferences_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;