ALTER TABLE "tag" ADD COLUMN "reserved" boolean DEFAULT false NOT NULL;
-- The roadmap's idea box relies on this Tag: it exists and is reserved on every environment.
INSERT INTO "tag" ("name", "reserved") VALUES ('roadmap', true)
	ON CONFLICT ("name") DO UPDATE SET "reserved" = true;
