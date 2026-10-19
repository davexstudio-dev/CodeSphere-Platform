CREATE TABLE "web_vitals" (
	"day" text,
	"country" text,
	"metric" text,
	"bucket" smallint,
	"samples" integer NOT NULL,
	CONSTRAINT "web_vitals_pkey" PRIMARY KEY("day","country","metric","bucket")
);
