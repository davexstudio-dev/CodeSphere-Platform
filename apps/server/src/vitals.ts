import { countryOf, recordWebVital } from "@codesphere/api/vitals/service";
import { WebVitalReport } from "@codesphere/contract";
import type { Database } from "@codesphere/db";

// Real-user Web Vitals beacon (#251): `POST /api/v1/vitals` with `{ name, value }`. No cookie, no
// session, no stored IP: the country comes from Cloudflare's CF-IPCountry header, and the report
// only increments an aggregate counter, so the table cannot grow with traffic. `sendBeacon` posts
// `text/plain` (no CORS preflight), so the body is parsed as JSON by hand.
//
// There is deliberately no per-client rate limit here: the client address is either forgeable
// (X-Forwarded-For) or shared by a whole mobile network, so a limit would be bypassed by an attacker
// and would drop the honest reports of exactly the countries this measures. Flooding is a Cloudflare
// rate-limiting rule's job, at the edge.
const MAX_BODY_BYTES = 512;

/** The body as text, or null when it exceeds `max` bytes: read through a cap, never buffered whole. */
async function readCapped(
	request: Request,
	max: number,
): Promise<string | null> {
	const declared = Number(request.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > max) {
		return null;
	}
	if (!request.body) {
		return "";
	}
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > max) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}

export async function handleVitalsBeacon(
	request: Request,
	options: { db: Database },
): Promise<Response> {
	const text = await readCapped(request, MAX_BODY_BYTES);
	if (text === null) {
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
	await recordWebVital(options.db, {
		metric: report.data.name,
		value: report.data.value,
		country: countryOf(request.headers.get("cf-ipcountry")),
	});
	// Nothing to read back: a beacon ignores the answer.
	return new Response(null, { status: 204 });
}
