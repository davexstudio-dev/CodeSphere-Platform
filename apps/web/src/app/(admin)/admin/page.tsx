"use client";

import type { KpiPeriod } from "@codesphere/contract";
import { Button } from "@codesphere/ui/components/atoms/button";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@codesphere/ui/components/molecules/alert";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@codesphere/ui/components/molecules/tabs";
import { KpiGrid } from "@codesphere/ui/components/organisms/kpi-grid";
import { useQuery } from "@tanstack/react-query";
import { AlertCircleIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { z } from "zod";

import AdminFrame from "@/components/admin-frame";
import { deltaOf, formatMetric, LOWER_IS_BETTER } from "@/lib/admin-kpi";
import { moderationErrorKey } from "@/lib/admin-moderation";
import { orpc } from "@/utils/orpc";

type Period = z.infer<typeof KpiPeriod>;
const PERIODS: readonly Period[] = ["7d", "30d"];

function PeriodGrid({ period }: { period: Period }) {
	const t = useTranslations("admin.dashboard");
	const locale = useLocale();
	const report = useQuery(orpc.admin.kpi.queryOptions({ input: { period } }));

	if (report.isError) {
		return (
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
		);
	}
	if (report.isPending) {
		return <p className="text-muted-foreground text-sm">{t("loading")}</p>;
	}
	return (
		<KpiGrid
			items={report.data.metrics.map((metric) => ({
				id: metric.id,
				label: t(`metrics.${metric.id}`),
				value: formatMetric(metric.id, metric.value, locale) ?? t("none"),
				delta: deltaOf(metric.value, metric.previous),
				lowerIsBetter: LOWER_IS_BETTER.includes(metric.id),
				hint: t(`versus.${period}`),
				trend: metric.trend.map((point) => point ?? 0),
			}))}
		/>
	);
}

// Real community KPIs over 7 or 30 days, from admin.kpi (#113).
export default function DashboardPage() {
	const t = useTranslations("admin.dashboard");
	const [period, setPeriod] = useState<Period>("7d");

	return (
		<AdminFrame title={t("title")} description={t("description")}>
			<Tabs
				value={period}
				onValueChange={(value) => setPeriod(value as Period)}
			>
				<TabsList>
					{PERIODS.map((p) => (
						<TabsTrigger key={p} value={p}>
							{t(`periods.${p}`)}
						</TabsTrigger>
					))}
				</TabsList>
				{PERIODS.map((p) => (
					<TabsContent key={p} value={p}>
						{p === period && <PeriodGrid period={p} />}
					</TabsContent>
				))}
			</Tabs>
		</AdminFrame>
	);
}
