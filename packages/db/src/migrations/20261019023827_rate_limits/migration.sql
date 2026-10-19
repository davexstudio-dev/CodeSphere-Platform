CREATE TABLE "rate_limits" (
	"key" text,
	"window_start" bigint,
	"hits" integer NOT NULL,
	"expires_at" bigint NOT NULL,
	CONSTRAINT "rate_limits_pkey" PRIMARY KEY("key","window_start")
);
