"use client";

import { SegmentedControl } from "@codesphere/ui/components/molecules/segmented-control";
import { DataSaverProvider } from "@codesphere/ui/lib/data-saver";
import { useTranslations } from "next-intl";
import { createContext, useContext, useTransition } from "react";
import {
	DATA_SAVER_PREFERENCES,
	type DataSaverPreference,
} from "@/lib/data-saver";
import { setDataSaver } from "@/lib/data-saver-actions";

const PreferenceContext = createContext<DataSaverPreference>("auto");

/** Hands the request's data saver decision, and the Member's stored choice, to the tree. */
export function DataSaver({
	active,
	preference,
	children,
}: {
	active: boolean;
	preference: DataSaverPreference;
	children: React.ReactNode;
}) {
	return (
		<PreferenceContext.Provider value={preference}>
			<DataSaverProvider active={active}>{children}</DataSaverProvider>
		</PreferenceContext.Provider>
	);
}

/** Auto (follow the browser's Save-Data), on, or off: stored in a cookie, available to visitors too. */
export function DataSaverToggle() {
	const t = useTranslations("dataSaver");
	const preference = useContext(PreferenceContext);
	const [pending, startTransition] = useTransition();
	return (
		<div className="flex flex-wrap items-center justify-center gap-2 px-4 py-3 text-muted-foreground text-xs">
			<span id="data-saver-label">{t("label")}</span>
			<SegmentedControl
				aria-labelledby="data-saver-label"
				aria-busy={pending}
				options={DATA_SAVER_PREFERENCES}
				labels={{
					auto: t("options.auto"),
					on: t("options.on"),
					off: t("options.off"),
				}}
				value={preference}
				onValueChange={(next) => startTransition(() => setDataSaver(next))}
				className="text-xs"
			/>
			<span className="sr-only">{t(`hint.${preference}`)}</span>
		</div>
	);
}
