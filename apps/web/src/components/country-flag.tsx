"use client";

import { Flag } from "@codesphere/ui/components/atoms/flag";
import { countryName, isCountryCode } from "@codesphere/ui/lib/countries";
import { useLocale } from "next-intl";

/**
 * A Member's country as a flag named in the interface language. Nothing for a country the platform
 * does not know (an old free-text value), so a stray code is never shown as if it were a country.
 */
export function CountryFlag({ code }: { code: string | null | undefined }) {
	const locale = useLocale();
	if (!code) {
		return null;
	}
	const upper = code.toUpperCase();
	if (upper !== "OTHER" && !isCountryCode(upper)) {
		return null;
	}
	return <Flag code={upper} name={countryName(upper, locale)} />;
}

/** A country as its flag and its name (lists and profiles, where there is room for the name). */
export function CountryLabel({ code }: { code: string | null | undefined }) {
	const locale = useLocale();
	if (!code) {
		return null;
	}
	const upper = code.toUpperCase();
	if (upper !== "OTHER" && !isCountryCode(upper)) {
		// An old free-text value: shown as is, without a flag.
		return <span>{code}</span>;
	}
	const name = countryName(upper, locale);
	return (
		<span className="inline-flex items-center gap-1.5">
			<Flag code={upper} name={name} />
			<span>{name}</span>
		</span>
	);
}
