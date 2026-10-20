"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Switch } from "@codesphere/ui/components/atoms/switch";
import { Field } from "@codesphere/ui/components/molecules/field";
import {
	SettingRow,
	SettingsSection,
} from "@codesphere/ui/components/molecules/setting-row";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@codesphere/ui/components/molecules/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BotIcon, DatabaseIcon, TagIcon, UserIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CountryPicker } from "@/components/country-picker";
import { useOutbox } from "@/components/outbox-provider";
import { AgentsSection } from "@/components/settings/agents-section";
import { FeedPersonalization } from "@/components/settings/feed-section";
import { PrivacyActions } from "@/components/settings/privacy-section";
import { TalentCardSection } from "@/components/settings/talent-section";
import { waiting } from "@/lib/outbox";
import { orpc } from "@/utils/orpc";

type Draft = {
	name: string;
	country: string;
	city: string;
	cityPublic: boolean;
	hideAgentContent: boolean;
};

// Settings first (spec §2, #64): public profile, preferences and privacy of the signed-in member.
function TagsSection() {
	const t = useTranslations("settings.tags");
	const queryClient = useQueryClient();
	const [q, setQ] = useState("");
	const followed = useQuery(orpc.tags.followed.queryOptions());
	const found = useQuery({
		...orpc.tags.search.queryOptions({
			input: { q: q.trim() || undefined, limit: 8 },
		}),
		enabled: q.trim().length > 0,
	});
	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey: orpc.tags.key() });
		void queryClient.invalidateQueries({ queryKey: orpc.feed.key() });
	};
	// Following goes through the outbox (#74): it works offline and is sent with the network.
	const { enqueue, entries } = useOutbox();
	const queued = new Set(
		waiting(entries).flatMap((e) =>
			e.action.kind === "tag.follow" ? [e.action.input.tag] : [],
		),
	);
	const unfollow = useMutation(
		orpc.tags.unfollow.mutationOptions({
			onSuccess: refresh,
			onError: () => toast.error(t("failed")),
		}),
	);
	const items = followed.data?.items ?? [];

	return (
		<SettingsSection title={t("title")} description={t("description")}>
			<div className="flex flex-col gap-3">
				<h3 className="font-medium text-sm">{t("followed")}</h3>
				{items.length === 0 ? (
					<p className="text-muted-foreground text-sm">{t("none")}</p>
				) : (
					<ul className="flex flex-wrap gap-2">
						{items.map((tag) => (
							<li key={tag.name}>
								<Button
									type="button"
									variant="outline"
									size="sm"
									aria-label={t("unfollow", { name: tag.name })}
									disabled={unfollow.isPending}
									onClick={() => unfollow.mutate({ tag: tag.name })}
								>
									# {tag.name} ×
								</Button>
							</li>
						))}
					</ul>
				)}
				<Field id="tag-search" label={t("search")}>
					<Input
						id="tag-search"
						type="search"
						placeholder={t("searchPlaceholder")}
						value={q}
						onChange={(event) => setQ(event.target.value)}
					/>
				</Field>
				{q.trim() && found.data && (
					<ul className="flex flex-wrap gap-2">
						{found.data.items.length === 0 && (
							<li className="text-muted-foreground text-sm">{t("noResult")}</li>
						)}
						{found.data.items.map((tag) => (
							<li key={tag.name}>
								<Button
									type="button"
									variant={tag.followed ? "secondary" : "default"}
									size="sm"
									aria-label={t("follow", { name: tag.name })}
									disabled={tag.followed || queued.has(tag.name)}
									onClick={() =>
										void enqueue({
											kind: "tag.follow",
											input: { tag: tag.name },
										})
									}
								>
									# {tag.name}
								</Button>
							</li>
						))}
					</ul>
				)}
			</div>
		</SettingsSection>
	);
}

function ProfileForm() {
	const t = useTranslations("settings");
	const queryClient = useQueryClient();
	const me = useQuery(orpc.members.me.queryOptions());
	const [draft, setDraft] = useState<Draft>();

	useEffect(() => {
		if (me.data) {
			setDraft({
				name: me.data.name,
				country: me.data.country ?? "",
				city: me.data.city ?? "",
				cityPublic: me.data.cityPublic,
				hideAgentContent: me.data.hideAgentContent,
			});
		}
	}, [me.data]);

	const save = useMutation(
		orpc.members.update.mutationOptions({
			onSuccess: (profile) => {
				// The update returns the profile only: keep what `me` adds (the first Question).
				queryClient.setQueryData(orpc.members.me.queryKey(), (current) =>
					current ? { ...current, ...profile } : undefined,
				);
				toast.success(t("saved"));
			},
			onError: () => toast.error(t("saveFailed")),
		}),
	);

	if (!draft) {
		return <p className="p-6 text-muted-foreground text-sm">{t("loading")}</p>;
	}

	const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
		setDraft({ ...draft, [key]: value });

	return (
		<form
			className="flex flex-col gap-6"
			onSubmit={(event) => {
				event.preventDefault();
				save.mutate({
					name: draft.name,
					country: draft.country.trim()
						? draft.country.trim().toUpperCase()
						: null,
					city: draft.city.trim() || null,
					cityPublic: draft.cityPublic,
					hideAgentContent: draft.hideAgentContent,
				});
			}}
		>
			<SettingsSection
				title={t("profile.title")}
				description={t("profile.description")}
			>
				<div className="flex flex-col gap-4 pb-1">
					{/* Read only: earned from the Votes and acceptances the Member's work receives (#239). */}
					{me.data?.reputation != null && (
						<div className="flex flex-col gap-1">
							<p className="font-medium text-sm">{t("profile.reputation")}</p>
							<p className="font-semibold text-2xl tabular-nums">
								{me.data.reputation}
							</p>
							<p className="text-muted-foreground text-sm">
								{t("profile.reputationHint")}
							</p>
						</div>
					)}
					<Field id="name" label={t("profile.name")} required>
						<Input
							id="name"
							value={draft.name}
							maxLength={80}
							required
							onChange={(event) => set("name", event.target.value)}
						/>
					</Field>
					<Field
						id="country"
						label={t("profile.country")}
						description={t("profile.countryHint")}
					>
						<CountryPicker
							id="country"
							value={draft.country}
							onValueChange={(country) => set("country", country)}
						/>
					</Field>
					<Field
						id="city"
						label={t("profile.city")}
						description={t("profile.cityHint")}
					>
						<Input
							id="city"
							value={draft.city}
							maxLength={100}
							autoComplete="address-level2"
							onChange={(event) => set("city", event.target.value)}
						/>
					</Field>
				</div>
			</SettingsSection>

			<SettingsSection title={t("preferences.title")}>
				<SettingRow
					title={t("preferences.hideAgentContent")}
					description={t("preferences.hideAgentContentHint")}
				>
					<Switch
						aria-label={t("preferences.hideAgentContent")}
						checked={draft.hideAgentContent}
						onCheckedChange={(checked) => set("hideAgentContent", checked)}
					/>
				</SettingRow>
			</SettingsSection>

			<SettingsSection title={t("privacy.title")}>
				<SettingRow
					title={t("privacy.cityPublic")}
					description={t("privacy.cityPublicHint")}
				>
					<Switch
						aria-label={t("privacy.cityPublic")}
						checked={draft.cityPublic}
						onCheckedChange={(checked) => set("cityPublic", checked)}
					/>
				</SettingRow>
			</SettingsSection>

			{/* Phone: stays in reach at the bottom of the screen, under three sections of fields. */}
			<div className="sticky bottom-0 z-10 -mx-4 flex justify-end border-border border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
				<Button type="submit" disabled={save.isPending}>
					{save.isPending ? t("saving") : t("save")}
				</Button>
			</div>
		</form>
	);
}

const TABS = [
	{ key: "profile", icon: UserIcon },
	{ key: "tags", icon: TagIcon },
	{ key: "agents", icon: BotIcon },
	{ key: "data", icon: DatabaseIcon },
] as const;
type SettingsTab = (typeof TABS)[number]["key"];

const isTab = (value: string | null): value is SettingsTab =>
	TABS.some((tab) => tab.key === value);

export default function SettingsPage() {
	const t = useTranslations("settings");
	const router = useRouter();
	const params = useSearchParams();
	const requested = params.get("tab");
	// In the address (?tab=tags): a link opens the right tab, and reloading keeps it.
	const tab: SettingsTab = isTab(requested) ? requested : "profile";
	const select = (next: unknown) => {
		if (isTab(next as string)) {
			router.replace(`/settings?tab=${next as string}`, { scroll: false });
		}
	};

	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
			<h1 className="font-semibold text-2xl">{t("title")}</h1>
			<Tabs
				value={tab}
				onValueChange={select}
				className="gap-6 md:flex-row md:items-start"
			>
				{/* A row that scrolls on a phone, a sticky column beside the panel from md up. */}
				<TabsList className="grid w-full grid-cols-4 rounded-2xl md:sticky md:top-24 md:flex md:w-52 md:shrink-0 md:flex-col md:items-stretch">
					{TABS.map(({ key, icon: Icon }) => (
						<TabsTrigger
							key={key}
							value={key}
							className="flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-xs md:flex-row md:justify-start md:gap-2 md:px-3 md:text-sm"
						>
							<Icon className="size-4" />
							<span className="max-w-full truncate">{t(`tabs.${key}`)}</span>
						</TabsTrigger>
					))}
				</TabsList>
				<div className="min-w-0 flex-1">
					<TabsContent value="profile" className="flex flex-col gap-6">
						<ProfileForm />
						<TalentCardSection />
					</TabsContent>
					{/* Outside the profile form: each has its own actions, and forms do not nest. */}
					<TabsContent value="tags" className="flex flex-col gap-6">
						<TagsSection />
						<FeedPersonalization />
					</TabsContent>
					<TabsContent value="agents">
						<AgentsSection />
					</TabsContent>
					<TabsContent value="data">
						<SettingsSection
							title={t("privacy.dataTitle")}
							description={t("privacy.dataDescription")}
						>
							<PrivacyActions />
						</SettingsSection>
					</TabsContent>
				</div>
			</Tabs>
		</main>
	);
}
