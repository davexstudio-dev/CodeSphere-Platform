"use client";

import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import type { Selection } from "@/components/admin-legal-shared";
import { MarkdownPreview } from "@/components/markdown-preview";
import { orpc } from "@/utils/orpc";

export function History({
	selection,
	onCopy,
}: {
	selection: Selection;
	onCopy: (content: string, version: number) => void;
}) {
	const t = useTranslations("admin.legal");
	const format = useFormatter();
	const [reading, setReading] = useState<number | null>(null);
	const history = useQuery(
		orpc.admin.legal.history.queryOptions({ input: selection }),
	);
	const detail = useQuery({
		...orpc.admin.legal.version.queryOptions({
			input: { ...selection, version: reading ?? 1 },
		}),
		enabled: reading !== null,
	});
	const items = history.data?.items ?? [];

	if (history.isPending) {
		return <p className="text-muted-foreground text-sm">{t("loading")}</p>;
	}
	if (items.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">{t("history.empty")}</p>
		);
	}
	return (
		<ol className="grid gap-3">
			{items.map((item) => (
				<li key={item.version} className="grid gap-2 rounded-md border p-3">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium text-sm">
							{t("history.version", { version: item.version })}
						</span>
						{item.important && (
							<Badge variant="outline">{t("history.important")}</Badge>
						)}
						<span className="text-muted-foreground text-xs">
							{t("history.by", {
								name: item.publishedByName ?? "—",
								date: format.dateTime(new Date(item.publishedAt), {
									dateStyle: "long",
								}),
							})}
						</span>
					</div>
					<p className="text-sm">
						{t("history.reason", { reason: item.reason })}
					</p>
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								setReading(reading === item.version ? null : item.version)
							}
						>
							{reading === item.version
								? t("history.close")
								: t("history.read")}
						</Button>
						{reading === item.version && detail.data && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => onCopy(detail.data.content, item.version)}
							>
								{t("history.copy")}
							</Button>
						)}
					</div>
					{reading === item.version && detail.data && (
						<div className="rounded-md border bg-muted/30 p-3">
							<MarkdownPreview body={detail.data.content} />
						</div>
					)}
				</li>
			))}
		</ol>
	);
}
