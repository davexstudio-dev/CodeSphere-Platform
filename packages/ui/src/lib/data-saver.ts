"use client";

import { createContext, createElement, useContext } from "react";

// Data saver mode (#250): the app decides once per request (preference cookie, else the browser's
// `Save-Data` header) and every component asks here. In this mode a component renders no remote
// image, no animation and no prefetch, and a list asks for a shorter page.
const DataSaverContext = createContext(false);

export function DataSaverProvider({
	active,
	children,
}: {
	active: boolean;
	children: React.ReactNode;
}) {
	return createElement(DataSaverContext.Provider, { value: active }, children);
}

/** Whether data saver mode is on for this request. */
export function useDataSaver(): boolean {
	return useContext(DataSaverContext);
}
