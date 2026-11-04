import {
	integer,
	pgTable,
	primaryKey,
	smallint,
	text,
} from "drizzle-orm/pg-core";

// Real-user Web Vitals by country (#251, map #224). Aggregated on arrival: one counter per day,
// country, metric and value bucket. No row stands for a visit, a page or a person, and nothing but
// the country (from Cloudflare's `CF-IPCountry`, never the IP) is kept, so there is no personal
// data and no cookie. The buckets are defined in packages/api/src/vitals/buckets.ts.
export const webVitals = pgTable(
	"web_vitals",
	{
		// UTC day, `YYYY-MM-DD`.
		day: text("day").notNull(),
		// ISO 3166-1 alpha-2, or `XX` when unknown.
		country: text("country").notNull(),
		metric: text("metric", {
			enum: ["LCP", "INP", "CLS", "FCP", "TTFB"],
		}).notNull(),
		bucket: smallint("bucket").notNull(),
		samples: integer("samples").notNull(),
	},
	(t) => [primaryKey({ columns: [t.day, t.country, t.metric, t.bucket] })],
);
