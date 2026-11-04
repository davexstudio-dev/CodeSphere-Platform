CREATE TABLE "job_applications" (
	"user_id" text,
	"job_id" uuid,
	"shared_card" boolean DEFAULT false NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "job_applications_pkey" PRIMARY KEY("user_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "job_postings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"country" text NOT NULL,
	"remote" boolean DEFAULT false NOT NULL,
	"apply_url" text,
	"apply_email" text,
	"status" text DEFAULT 'published' NOT NULL,
	"removed_reason" text,
	"published_at" timestamp(3) DEFAULT now() NOT NULL,
	"expires_at" timestamp(3) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_reports" (
	"user_id" text,
	"job_id" uuid,
	"reason" text NOT NULL,
	"outcome" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "job_reports_pkey" PRIMARY KEY("user_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "talent_cards" (
	"user_id" text PRIMARY KEY,
	"enabled" boolean DEFAULT false NOT NULL,
	"open_to_contact" boolean DEFAULT false NOT NULL,
	"headline" text,
	"code_url" text,
	"contact_email" text,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "job_postings_listing_idx" ON "job_postings" ("status","expires_at","published_at");--> statement-breakpoint
CREATE INDEX "job_postings_org_idx" ON "job_postings" ("organization_id");--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_job_id_job_postings_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job_postings"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id");--> statement-breakpoint
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "job_reports" ADD CONSTRAINT "job_reports_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "job_reports" ADD CONSTRAINT "job_reports_job_id_job_postings_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job_postings"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "talent_cards" ADD CONSTRAINT "talent_cards_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;