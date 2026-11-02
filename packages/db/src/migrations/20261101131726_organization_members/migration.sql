CREATE TABLE "organization_invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"invitee_id" text NOT NULL,
	"invited_by" text NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"decided_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "organization_member" (
	"organization_id" uuid,
	"user_id" text,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "organization_member_pkey" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invitation_open_idx" ON "organization_invitation" ("organization_id","invitee_id") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "organization_invitation_invitee_idx" ON "organization_invitation" ("invitee_id");--> statement-breakpoint
CREATE INDEX "organization_member_user_idx" ON "organization_member" ("user_id");--> statement-breakpoint
ALTER TABLE "organization_invitation" ADD CONSTRAINT "organization_invitation_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_invitation" ADD CONSTRAINT "organization_invitation_invitee_id_user_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "organization_invitation" ADD CONSTRAINT "organization_invitation_invited_by_user_id_fkey" FOREIGN KEY ("invited_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");