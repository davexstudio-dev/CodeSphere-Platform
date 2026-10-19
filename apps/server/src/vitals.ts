import { countryOf, recordWebVital } from "@codesphere/api/vitals/service";
import { WebVitalReport } from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import { truncateIp } from "@codesphere/logger";
import { MemoryRateLimiter } from "@orpc/ratelimit/memory";

// Real-user Web Vitals beacon (#251): `POST /api/v1/vitals` with `{ name, value }`. No cookie, no
// session, no stored IP: the country comes from Cloudflare's CF-IPCountry header, and the report
// only increments an aggregate counter. `sendBeacon` posts `text/plain` (no CORS preflight), so the
// body is parsed as JSON by hand.
const MAX_BODY_BYTES = 512;

// Best effort against a script flooding the table: per process, keyed by the truncated IP, which is
// never stored. A shared limiter would cost a database write per beacon.
const limiter = new MemoryRateLimiter({ maxRequests: 60, window: 60_000 });

export async function handleVitalsBeacon(
	request: Request,
	options: { db: Database; trustProxy: boolean },
): Promise<Response> {
	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) {
		return new Response(null, { status: 413 });
	}
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		return new Response(null, { status: 400 });
	}
	const report = WebVitalReport.safeParse(json);
	if (!report.success) {
		return new Response(null, { status: 400 });
	}
	if (options.trustProxy) {
		const forwarded = request.headers
			.get("x-forwarded-for")
			?.split(",")[0]
			?.trim();
		const key = truncateIp(forwarded) ?? "unknown";
		if (!(await limiter.limit(key)).success) {
			return new Response(null, { status: 429 });
		}
	}
	await recordWebVital(options.db, {
		metric: report.data.name,
		value: report.data.value,
		country: countryOf(request.headers.get("cf-ipcountry")),
	});
	// Nothing to read back: a beacon ignores the answer.
	return new Response(null, { status: 204 });
}
