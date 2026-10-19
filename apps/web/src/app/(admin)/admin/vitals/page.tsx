"use client";

import type { WebVitalMetric } from "@codesphere/contract";
import { Button } from "@codesphere/ui/components/atoms/button";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@codesphere/ui/components/molecules/alert";
import { useQuery } from "@tanstack/react-query";
import { AlertCircleIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import AdminFrame from "@/components/admin-frame";
import { moderationErrorKey } from "@/lib/admin-moderation";
import { orpc } from "@/utils/orpc";

const METRICS: readonly WebVitalMetric[] = ["LCP", "INP", "CLS", "FCP", "TTFB"];
const PERIODS = [7, 30] as const;

/** Real-user Web Vitals by country (#251): the 75th percentile of each metric, and how many reports it rests on. */
export default function VitalsPage() {
	const t = useTranslations("admin.vitals");
	const format = useFormatter();
	const [days, setDays] = useState<(typeof PERIODS)[number]>(7);
	const report = useQuery(
		orpc.admin.webVitals.byCountry.queryOptions({ input: { days } }),
	);
	const value = (metric: WebVitalMetric, p75: number | null) =>
		p75 === null
			? "—"
			: metric === "CLS"
				? format.number(p75, { maximumFractionDigits: 2 })
				: `${format.number(p75)} ms`;

	return (
		<AdminFrame title={t("title")} description={t("description")}>
			<div className="flex gap-2">
				{PERIODS.map((period) => (
					<Button
						key={period}
						size="sm"
						variant={period === days ? "default" : "outline"}
						onClick={() => setDays(period)}
					>
						{t("lastDays", { count: period })}
					</Button>
				))}
			</div>
			{report.isError ? (
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertTitle>{t("unavailable")}</AlertTitle>
					<AlertDescription>
						{moderationErrorKey(report.error) === "forbidden"
							? t("forbidden")
							: t("error")}{" "}
						<Button variant="link" size="sm" onClick={() => report.refetch()}>
							{t("retry")}
						</Button>
					</AlertDescription>
				</Alert>
			) : report.isPending ? (
				<p className="text-muted-foreground text-sm">{t("loading")}</p>
			) : report.data.countries.length === 0 ? (
				<p className="text-muted-foreground text-sm">{t("empty")}</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead className="text-muted-foreground">
							<tr>
								<th className="py-2 pr-4 font-medium">{t("country")}</th>
								{METRICS.map((metric) => (
									<th key={metric} className="py-2 pr-4 font-medium">
										{metric}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{report.data.countries.map((row) => (
								<tr key={row.country} className="border-t">
									<td className="py-2 pr-4 font-medium">
										{row.country === "XX" ? t("unknown") : row.country}
									</td>
									{METRICS.map((metric) => {
										const cell = row.metrics.find((m) => m.metric === metric);
										return (
											<td key={metric} className="py-2 pr-4">
												{cell ? (
													<>
														<span
															className={
																cell.goodShare >= 0.75
																	? "text-success"
																	: cell.goodShare < 0.5
																		? "text-destructive"
																		: undefined
															}
														>
															{value(metric, cell.p75)}
														</span>
														<span className="block text-muted-foreground text-xs">
															{t("samples", { count: cell.samples })} ·{" "}
															{format.number(cell.goodShare, {
																style: "percent",
																maximumFractionDigits: 0,
															})}
														</span>
													</>
												) : (
													"—"
												)}
											</td>
										);
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			<p className="text-muted-foreground text-xs">{t("note")}</p>
		</AdminFrame>
	);
}
