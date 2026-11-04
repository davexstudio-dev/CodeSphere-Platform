CREATE TABLE "staff_invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" text NOT NULL,
	"role" "user_role" NOT NULL,
	"invited_by" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"expires_at" timestamp(3) NOT NULL,
	"revoked_at" timestamp(3),
	"accepted_at" timestamp(3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invitation_open_email_idx" ON "staff_invitation" ("email") WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "staff_invitation_created_idx" ON "staff_invitation" ("created_at");--> statement-breakpoint
ALTER TABLE "staff_invitation" ADD CONSTRAINT "staff_invitation_invited_by_user_id_fkey" FOREIGN KEY ("invited_by") REFERENCES "user"("id") ON DELETE SET NULL;