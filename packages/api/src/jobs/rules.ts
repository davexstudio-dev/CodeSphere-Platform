import { JOB_DURATION_DAYS } from "@codesphere/db/schema/jobs";

// Rules of a Job posting (#258): a candidate never pays, and a posting lasts 30 days.

const DAY_MS = 86_400_000;

/** When a posting published at `at` stops being listed. */
export const expiryOf = (at: Date) =>
	new Date(at.getTime() + JOB_DURATION_DAYS * DAY_MS);

// Wordings of a posting that asks the candidate for money, the mark of a recruitment scam. French
// and English. A refused posting is told why, so an honest one can reword it.
const MONEY_ASKED: readonly RegExp[] = [
	/frais\s+(de|d['’])\s*(dossier|inscription|recrutement|formation|activation|traitement|visa|v[ée]rification)/i,
	/(registration|application|processing|training|recruitment|activation|onboarding|verification|visa)\s+fees?\b/i,
	// A payment verb, a sum or a money word, and the moment the candidate is asked to pay.
	/\b(pay(?:ez|er|e)?|vers(?:ez|er|ement)|envoy(?:ez|er)|r[ée]gl(?:ez|er)|d[ée]pos\w+|send\w*|deposit\w*|transfer\w*)\b[^.\n]{0,40}\b(\d[\d\s.,]*\s*(fcfa|xof|cfa|usd|eur|€|\$)|money|argent|fees?|frais|somme|montant)[^.\n]{0,40}\b(pour\s+postuler|pour\s+[êe]tre\s+(recrut[ée]|retenu|embauch[ée])|avant\s+(l['’]embauche|de\s+commencer|l['’]entretien)|to\s+apply|to\s+be\s+(hired|selected)|before\s+(you\s+)?(start|being\s+hired|the\s+interview))/i,
	/\b(pay(?:ez|er|e)?|vers(?:ez|er|ement)|envoy(?:ez|er)|r[ée]gl(?:ez|er))\b[^.\n]{0,40}\b(pour\s+postuler|to\s+apply)/i,
	/(d[ée]p[ôo]t\s+de\s+garantie|caution\s+(obligatoire|exig[ée]e)|refundable\s+deposit|security\s+deposit\s+(required|is\s+required))/i,
	/(western\s+union|moneygram)/i,
];

/** Whether the text asks the candidate to pay something to apply or to be hired. */
export function asksCandidateForMoney(text: string): boolean {
	return MONEY_ASKED.some((pattern) => pattern.test(text));
}

/** Where to apply: exactly one of a link and an email. */
export function applyChannel(input: {
	applyUrl?: string | null;
	applyEmail?: string | null;
}): "url" | "email" | null {
	const url = Boolean(input.applyUrl);
	const email = Boolean(input.applyEmail);
	return url === email ? null : url ? "url" : "email";
}

/** Most live postings an Organization may keep at once. */
export const MAX_LIVE_POSTINGS = 5;

/** Upheld reports on distinct postings that suspend their Organization. */
export const UPHELD_REPORTS_TO_SUSPEND = 2;
