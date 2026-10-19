CREATE TABLE "rate_limits" (
	"key" text,
	"window_start" bigint,
	"hits" integer NOT NULL,
	"expires_at" bigint NOT NULL,
	CONSTRAINT "rate_limits_pkey" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE INDEX "rate_limits_expires_idx" ON "rate_limits" ("expires_at");