"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { Switch } from "@codesphere/ui/components/atoms/switch";
import { SegmentedControl } from "@codesphere/ui/components/molecules/segmented-control";
import {
	SettingRow,
	SettingsSection,
} from "@codesphere/ui/components/molecules/setting-row";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

const LANGUAGES = ["auto", "fr", "en"] as const;

/**
 * Personalisation of the « Pour toi » feed (#256): turn it off (the feed is then the hot score on
 * the followed Tags only), favour a language, and take back what « Moins comme ça » hid.
 */
export function FeedPersonalization() {
	const t = useTranslations("settings.feed");
	const queryClient = useQueryClient();
	const prefs = useQuery(orpc.feed.preferences.queryOptions({ input: {} }));
	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey: orpc.feed.key() });
	};
	const failed = () => toast.error(t("error"));
	const update = useMutation(
		orpc.feed.updatePreferences.mutationOptions({
			onSuccess: refresh,
			onError: failed,
		}),
	);
	const unmute = useMutation(
		orpc.feed.unmute.mutationOptions({ onSuccess: refresh, onError: failed }),
	);
	const data = prefs.data;

	return (
		<SettingsSection title={t("title")} description={t("description")}>
			<SettingRow
				title={t("personalization")}
				description={t("personalizationHint")}
			>
				<Switch
					aria-label={t("personalization")}
					checked={data?.personalization ?? true}
					disabled={!data || update.isPending}
					onCheckedChange={(personalization) =>
						update.mutate({ personalization })
					}
				/>
			</SettingRow>
			<SettingRow title={t("language")} description={t("languageHint")}>
				<SegmentedControl
					aria-label={t("language")}
					options={LANGUAGES}
					value={data?.language ?? "auto"}
					labels={{ auto: t("languageAuto"), fr: "FR", en: "EN" }}
					onValueChange={(value) =>
						update.mutate({ language: value === "auto" ? null : value })
					}
				/>
			</SettingRow>
			<div className="grid gap-2 py-3">
				<h3 className="font-medium text-sm">{t("muted")}</h3>
				{(data?.muted.length ?? 0) === 0 ? (
					<p className="text-muted-foreground text-sm">{t("mutedNone")}</p>
				) : (
					<ul className="flex flex-wrap gap-2">
						{data?.muted.map((m) => (
							<li
								key={`${m.kind}:${m.key}`}
								className="flex items-center gap-1 rounded-full border px-3 py-1 text-sm"
							>
								<span className="text-muted-foreground text-xs">
									{t(`kind.${m.kind}`)}
								</span>
								<span>{m.label}</span>
								<Button
									size="sm"
									variant="ghost"
									aria-label={t("unmute", { name: m.label })}
									disabled={unmute.isPending}
									onClick={() => unmute.mutate({ kind: m.kind, key: m.key })}
								>
									×
								</Button>
							</li>
						))}
					</ul>
				)}
			</div>
		</SettingsSection>
	);
}
