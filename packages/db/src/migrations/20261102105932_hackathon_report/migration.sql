CREATE TABLE "hackathon_report" (
	"user_id" text,
	"hackathon_id" uuid,
	"reason" text NOT NULL,
	"comment" text,
	"outcome" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "hackathon_report_pkey" PRIMARY KEY("user_id","hackathon_id")
);
--> statement-breakpoint
CREATE INDEX "hackathon_report_open_idx" ON "hackathon_report" ("hackathon_id");--> statement-breakpoint
ALTER TABLE "hackathon_report" ADD CONSTRAINT "hackathon_report_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hackathon_report" ADD CONSTRAINT "hackathon_report_hackathon_id_hackathon_id_fkey" FOREIGN KEY ("hackathon_id") REFERENCES "hackathon"("id") ON DELETE CASCADE;