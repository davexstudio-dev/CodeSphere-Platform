"use client";

import { useEffect } from "react";

import { getServerUrl } from "@/lib/server-url";
import { sendVital, shouldReport, vitalBody } from "@/lib/web-vitals";

/** Reports this visit's Web Vitals once each (#251). The library loads on demand, off the initial bundle. */
export function WebVitalsReporter() {
	useEffect(() => {
		if (
			!shouldReport({
				production: process.env.NODE_ENV === "production",
				webdriver: navigator.webdriver,
				doNotTrack: navigator.doNotTrack,
			})
		) {
			return;
		}
		const url = `${getServerUrl()}/api/v1/vitals`;
		void import("web-vitals").then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
			const report = (metric: { name: string; value: number }) =>
				sendVital(url, vitalBody(metric));
			onLCP(report);
			onINP(report);
			onCLS(report);
			onFCP(report);
			onTTFB(report);
		});
	}, []);
	return null;
}
