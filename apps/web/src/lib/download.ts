/** Saves `text` as a CSV file through the browser. A BOM first, so Excel reads the accents as UTF-8. */
export function downloadCsv(filename: string, text: string) {
	const url = URL.createObjectURL(
		new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8" }),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.append(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}
