CREATE TABLE "organization_terms_acceptance" (
	"organization_id" uuid,
	"version" text,
	"accepted_by" text NOT NULL,
	"accepted_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "organization_terms_acceptance_pkey" PRIMARY KEY("organization_id","version")
);
--> statement-breakpoint
ALTER TABLE "organization_terms_acceptance" ADD CONSTRAINT "organization_terms_acceptance_QbcJI33zI2yv_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_terms_acceptance" ADD CONSTRAINT "organization_terms_acceptance_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by") REFERENCES "user"("id");