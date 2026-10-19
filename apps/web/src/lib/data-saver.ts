// Data saver mode (#250), resolved on the server for each request so the first paint already has it.
// The Member's choice is a cookie (`on` or `off`, absent for "auto"); in auto mode the browser's own
// `Save-Data: on` request header decides, which is how Chrome's "Lite mode" / data saver announces
// itself.

export const DATA_SAVER_COOKIE = "data-saver";

export const DATA_SAVER_PREFERENCES = ["auto", "on", "off"] as const;
export type DataSaverPreference = (typeof DATA_SAVER_PREFERENCES)[number];

/** The preference a cookie value stands for; anything unknown is "auto". */
export function parsePreference(
	value: string | undefined,
): DataSaverPreference {
	return value === "on" || value === "off" ? value : "auto";
}

/** The `Save-Data` header is a list of tokens (`on`, possibly with others): `on` among them is a yes. */
export function saveDataRequested(header: string | null | undefined): boolean {
	return (header ?? "")
		.split(",")
		.some((token) => token.trim().toLowerCase() === "on");
}

/** Whether data saver mode is on: the Member's choice, else what the browser asks for. */
export function resolveDataSaver(
	preference: DataSaverPreference,
	saveDataHeader: string | null | undefined,
): boolean {
	if (preference === "on") return true;
	if (preference === "off") return false;
	return saveDataRequested(saveDataHeader);
}

/** A list page requests half the items in data saver mode (at least one). */
export function pageSizeFor(base: number, dataSaver: boolean): number {
	return dataSaver ? Math.max(1, Math.ceil(base / 2)) : base;
}
