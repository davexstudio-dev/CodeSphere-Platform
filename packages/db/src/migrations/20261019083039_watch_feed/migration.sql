CREATE TABLE "watch_blocked_domains" (
	"domain" text PRIMARY KEY,
	"reason" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watch_item_reports" (
	"user_id" text,
	"item_id" uuid,
	"reason" text NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "watch_item_reports_pkey" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "watch_item_saves" (
	"user_id" text,
	"item_id" uuid,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "watch_item_saves_pkey" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "watch_item_votes" (
	"user_id" text,
	"item_id" uuid,
	"value" integer NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "watch_item_votes_pkey" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "watch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"url" text NOT NULL,
	"url_key" text NOT NULL UNIQUE,
	"domain" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"language" text NOT NULL,
	"african_source" boolean DEFAULT false NOT NULL,
	"source_id" uuid,
	"submitter_id" text,
	"visibility" text DEFAULT 'pending' NOT NULL,
	"removed_reason" text,
	"published_at" timestamp(3) NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watch_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"feed_url" text NOT NULL UNIQUE,
	"domain" text NOT NULL,
	"language" text NOT NULL,
	"african" boolean DEFAULT false NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"last_fetched_at" timestamp(3),
	"last_error" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "watch_items_listing_idx" ON "watch_items" ("visibility","published_at","id");--> statement-breakpoint
CREATE INDEX "watch_items_source_idx" ON "watch_items" ("source_id");--> statement-breakpoint
CREATE INDEX "watch_items_domain_idx" ON "watch_items" ("domain");--> statement-breakpoint
ALTER TABLE "watch_item_reports" ADD CONSTRAINT "watch_item_reports_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "watch_item_reports" ADD CONSTRAINT "watch_item_reports_item_id_watch_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "watch_items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "watch_item_saves" ADD CONSTRAINT "watch_item_saves_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "watch_item_saves" ADD CONSTRAINT "watch_item_saves_item_id_watch_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "watch_items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "watch_item_votes" ADD CONSTRAINT "watch_item_votes_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "watch_item_votes" ADD CONSTRAINT "watch_item_votes_item_id_watch_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "watch_items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "watch_items" ADD CONSTRAINT "watch_items_source_id_watch_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "watch_sources"("id");--> statement-breakpoint
ALTER TABLE "watch_items" ADD CONSTRAINT "watch_items_submitter_id_user_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "user"("id");