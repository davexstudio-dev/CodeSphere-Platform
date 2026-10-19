"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Switch } from "@codesphere/ui/components/atoms/switch";
import {
	SettingRow,
	SettingsSection,
} from "@codesphere/ui/components/molecules/setting-row";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

/**
 * The Talent card (#258): an optional profile for recruiters, off by default. A recruiter only sees
 * it when the Member applies with it, or when they turned on « ouvert aux contacts ».
 */
export function TalentCardSection() {
	const t = useTranslations("settings.talent");
	const queryClient = useQueryClient();
	const card = useQuery(orpc.talent.mine.queryOptions({ input: {} }));
	const data = card.data;
	const [headline, setHeadline] = useState("");
	const [codeUrl, setCodeUrl] = useState("");
	const [contactEmail, setContactEmail] = useState("");
	useEffect(() => {
		if (data) {
			setHeadline(data.headline ?? "");
			setCodeUrl(data.codeUrl ?? "");
			setContactEmail(data.contactEmail ?? "");
		}
	}, [data]);
	const update = useMutation(
		orpc.talent.update.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({ queryKey: orpc.talent.key() });
			},
			onError: () => toast.error(t("error")),
		}),
	);

	return (
		<SettingsSection title={t("title")} description={t("description")}>
			<SettingRow title={t("enabled")} description={t("enabledHint")}>
				<Switch
					aria-label={t("enabled")}
					checked={data?.enabled ?? false}
					disabled={!data || update.isPending}
					onCheckedChange={(enabled) => update.mutate({ enabled })}
				/>
			</SettingRow>
			<SettingRow
				title={t("openToContact")}
				description={t("openToContactHint")}
			>
				<Switch
					aria-label={t("openToContact")}
					checked={data?.openToContact ?? false}
					disabled={!data || !data.enabled || update.isPending}
					onCheckedChange={(openToContact) => update.mutate({ openToContact })}
				/>
			</SettingRow>
			<form
				className="grid gap-2 py-3"
				onSubmit={(event) => {
					event.preventDefault();
					update.mutate({
						headline: headline.trim() || null,
						codeUrl: codeUrl.trim() || null,
						contactEmail: contactEmail.trim() || null,
					});
				}}
			>
				<Input
					value={headline}
					maxLength={140}
					onChange={(e) => setHeadline(e.target.value)}
					aria-label={t("headline")}
					placeholder={t("headline")}
				/>
				<Input
					type="url"
					value={codeUrl}
					onChange={(e) => setCodeUrl(e.target.value)}
					aria-label={t("codeUrl")}
					placeholder={t("codeUrl")}
				/>
				<Input
					type="email"
					value={contactEmail}
					onChange={(e) => setContactEmail(e.target.value)}
					aria-label={t("contactEmail")}
					placeholder={t("contactEmail")}
				/>
				<Button
					type="submit"
					size="sm"
					className="w-fit"
					disabled={update.isPending}
				>
					{t("save")}
				</Button>
			</form>
			{data && (
				<div className="grid gap-1 py-3 text-sm">
					<h3 className="font-medium">{t("preview")}</h3>
					<p className="text-muted-foreground">
						{t("previewLine", {
							reputation: data.preview.reputation,
							tags: data.preview.strongestTags.join(", ") || "—",
							country: data.preview.country ?? "—",
						})}
					</p>
				</div>
			)}
		</SettingsSection>
	);
}
