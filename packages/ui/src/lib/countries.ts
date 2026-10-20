/**
 * The countries a Member can declare (ISO 3166-1 alpha-2), African ones first: the platform is for
 * African developers. Names come from the browser (`Intl.DisplayNames`) in the interface language,
 * so no name table is shipped. `OTHER` stands for the diaspora (outside this list).
 * The African set is the one of the Africa bonus (packages/api/src/feed-mixed/ranking.ts).
 */
export const AFRICAN_COUNTRY_CODES = [
	"DZ",
	"AO",
	"BJ",
	"BW",
	"BF",
	"BI",
	"CV",
	"CM",
	"CF",
	"TD",
	"KM",
	"CG",
	"CD",
	"CI",
	"DJ",
	"EG",
	"GQ",
	"ER",
	"SZ",
	"ET",
	"GA",
	"GM",
	"GH",
	"GN",
	"GW",
	"KE",
	"LS",
	"LR",
	"LY",
	"MG",
	"MW",
	"ML",
	"MR",
	"MU",
	"MA",
	"MZ",
	"NA",
	"NE",
	"NG",
	"RW",
	"ST",
	"SN",
	"SC",
	"SL",
	"SO",
	"ZA",
	"SS",
	"SD",
	"TZ",
	"TG",
	"TN",
	"UG",
	"ZM",
	"ZW",
] as const;

export const OTHER_COUNTRY_CODES = [
	"AD",
	"AE",
	"AF",
	"AG",
	"AI",
	"AL",
	"AM",
	"AQ",
	"AR",
	"AS",
	"AT",
	"AU",
	"AW",
	"AX",
	"AZ",
	"BA",
	"BB",
	"BD",
	"BE",
	"BG",
	"BH",
	"BL",
	"BM",
	"BN",
	"BO",
	"BQ",
	"BR",
	"BS",
	"BT",
	"BV",
	"BY",
	"BZ",
	"CA",
	"CC",
	"CH",
	"CK",
	"CL",
	"CN",
	"CO",
	"CR",
	"CU",
	"CW",
	"CX",
	"CY",
	"CZ",
	"DE",
	"DK",
	"DM",
	"DO",
	"EC",
	"EE",
	"EH",
	"ES",
	"FI",
	"FJ",
	"FK",
	"FM",
	"FO",
	"FR",
	"GB",
	"GD",
	"GE",
	"GF",
	"GG",
	"GI",
	"GL",
	"GP",
	"GR",
	"GS",
	"GT",
	"GU",
	"GY",
	"HK",
	"HM",
	"HN",
	"HR",
	"HT",
	"HU",
	"ID",
	"IE",
	"IL",
	"IM",
	"IN",
	"IO",
	"IQ",
	"IR",
	"IS",
	"IT",
	"JE",
	"JM",
	"JO",
	"JP",
	"KG",
	"KH",
	"KI",
	"KN",
	"KP",
	"KR",
	"KW",
	"KY",
	"KZ",
	"LA",
	"LB",
	"LC",
	"LI",
	"LK",
	"LT",
	"LU",
	"LV",
	"MC",
	"MD",
	"ME",
	"MF",
	"MH",
	"MK",
	"MM",
	"MN",
	"MO",
	"MP",
	"MQ",
	"MS",
	"MT",
	"MV",
	"MX",
	"MY",
	"NC",
	"NF",
	"NI",
	"NL",
	"NO",
	"NP",
	"NR",
	"NU",
	"NZ",
	"OM",
	"PA",
	"PE",
	"PF",
	"PG",
	"PH",
	"PK",
	"PL",
	"PM",
	"PN",
	"PR",
	"PS",
	"PT",
	"PW",
	"PY",
	"QA",
	"RE",
	"RO",
	"RS",
	"RU",
	"SA",
	"SB",
	"SE",
	"SG",
	"SH",
	"SI",
	"SJ",
	"SK",
	"SM",
	"SR",
	"SV",
	"SX",
	"SY",
	"TC",
	"TF",
	"TH",
	"TJ",
	"TK",
	"TL",
	"TM",
	"TO",
	"TR",
	"TT",
	"TV",
	"TW",
	"UA",
	"UM",
	"US",
	"UY",
	"UZ",
	"VA",
	"VC",
	"VE",
	"VG",
	"VI",
	"VN",
	"VU",
	"WF",
	"WS",
	"XA",

	"YE",
	"YT",
] as const;

export const COUNTRY_OTHER = "OTHER" as const;

const KNOWN = new Set<string>([
	...AFRICAN_COUNTRY_CODES,
	...OTHER_COUNTRY_CODES,
]);

/** Whether the code is a country of the list (case-insensitive). */
export function isCountryCode(code: string | null | undefined): boolean {
	return Boolean(code && KNOWN.has(code.toUpperCase()));
}

/** The country's name in `locale`; the code itself when the platform does not know it. */
export function countryName(code: string, locale: string): string {
	if (code === COUNTRY_OTHER) {
		return locale.startsWith("fr") ? "Autre pays" : "Other country";
	}
	try {
		return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
	} catch {
		return code;
	}
}

export type CountryOption = { value: string; label: string; africa: boolean };

/** Every option, African countries first then the others by name, in `locale`. */
export function countryOptions(locale: string): CountryOption[] {
	const names = new Intl.DisplayNames([locale], { type: "region" });
	// A code a browser's ICU rejects (RangeError) is shown as itself rather than breaking the list.
	const nameOf = (code: string) => {
		try {
			return names.of(code) ?? code;
		} catch {
			return code;
		}
	};
	const byName = (a: CountryOption, b: CountryOption) =>
		a.label.localeCompare(b.label, locale);
	const make = (codes: readonly string[], africa: boolean) =>
		codes
			.map((value) => ({ value, label: nameOf(value), africa }))
			.sort(byName);
	return [
		...make(AFRICAN_COUNTRY_CODES, true),
		...make(OTHER_COUNTRY_CODES, false),
		{
			value: COUNTRY_OTHER,
			label: countryName(COUNTRY_OTHER, locale),
			africa: false,
		},
	];
}

/** Lower-cased and accent-free, so « cote d ivoire » finds « Côte d'Ivoire ». */
export function normalizeSearch(text: string): string {
	return text
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/['’-]/g, " ")
		.toLowerCase()
		.trim();
}

/** Options matching a query by name or by code (« ci », « bf »); all of them for an empty query. */
export function filterCountries(
	options: CountryOption[],
	query: string,
): CountryOption[] {
	const q = normalizeSearch(query);
	if (!q) return options;
	return options.filter(
		(o) => normalizeSearch(o.label).includes(q) || o.value.toLowerCase() === q,
	);
}
