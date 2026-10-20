"use client";

import { CountrySelect } from "@codesphere/ui/components/molecules/country-select";
import { useLocale, useTranslations } from "next-intl";

/** The country select in the interface language: names, placeholder and messages. */
export function CountryPicker({
	value,
	onValueChange,
	id,
	ariaLabel,
}: {
	value: string;
	onValueChange: (code: string) => void;
	id?: string;
	ariaLabel?: string;
}) {
	const t = useTranslations("countrySelect");
	return (
		<CountrySelect
			id={id}
			ariaLabel={ariaLabel}
			value={value}
			locale={useLocale()}
			onValueChange={onValueChange}
			labels={{
				placeholder: t("placeholder"),
				empty: t("empty"),
				clear: t("clear"),
				open: t("open"),
				africa: t("africa"),
				others: t("others"),
			}}
		/>
	);
}
