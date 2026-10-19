import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { base } from "./base";

/** The Core Web Vitals and the two timings that explain them. */
export const WEB_VITAL_METRICS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export const WebVitalMetric = z.enum(WEB_VITAL_METRICS);
export type WebVitalMetric = z.infer<typeof WebVitalMetric>;

/** One measurement a browser reports (the beacon of #251): a metric and its value, nothing else. */
export const WebVitalReport = z.object({
	name: WebVitalMetric,
	// Milliseconds, except CLS which is unitless. Bounded: a wild value is a broken or forged report.
	value: z.number().finite().min(0).max(120_000),
});

export const CountryWebVitals = z.object({
	/** ISO 3166-1 alpha-2, or "XX" when the country could not be told. */
	country: z.string(),
	metrics: z.array(
		z.object({
			metric: WebVitalMetric,
			samples: z.number().int(),
			/** 75th percentile, as the upper bound of its value bucket (conservative). Null with no data or when above the last bound (then `p75Above` is set). */
			p75: z.number().nullable(),
			/** When the 75th percentile is above the last bucket edge, that edge ("more than"): tells an off-the-scale metric from no data. */
			p75Above: z.number().nullable(),
			/** Share of samples within the "good" threshold of Core Web Vitals, 0 to 1. */
			goodShare: z.number(),
		}),
	),
});

export const WebVitalsReport = z.object({
	days: z.number().int(),
	countries: z.array(CountryWebVitals),
});

export const vitalsAdminContract = {
	byCountry: base
		.errors({ UNAUTHORIZED: {}, FORBIDDEN: {} })
		.meta(
			openapi({
				method: "GET",
				path: "/admin/web-vitals",
				tags: ["admin"],
				summary: "Real-user Web Vitals by country",
				description:
					"LCP, INP, CLS, FCP and TTFB measured in visitors' browsers over the last N days, by country: the sample count, the 75th percentile and the share within the good threshold. Aggregated on arrival, no personal data. Requires a staff role.",
			}),
		)
		.input(z.object({ days: z.number().int().min(1).max(90).default(7) }))
		.output(WebVitalsReport),
};
