"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Skeleton } from "@codesphere/ui/components/atoms/skeleton";
import { Switch } from "@codesphere/ui/components/atoms/switch";
import { Field } from "@codesphere/ui/components/molecules/field";
import { ScrollArea } from "@codesphere/ui/components/molecules/scroll-area";
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
import {
	AwardIcon,
	BotIcon,
	MapPinIcon,
	ShieldIcon,
	TagIcon,
	UserIcon,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CountryPicker } from "@/components/country-picker";
import Link from "@/components/link";
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
};

// Settings (spec §2, #64), in five tabs since #292: profile, reputation, interests, agents, privacy.
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

/** Warns before leaving the page (reload, close, another site) while a form holds changes. */
function useLeaveWarning(dirty: boolean) {
	useEffect(() => {
		if (!dirty) {
			return;
		}
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault();
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [dirty]);
}

const initialsOf = (name: string) =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part.charAt(0).toUpperCase())
		.join("") || "?";

/** Who the reader is, above the tabs: initials, name, Reputation and country. */
function ProfileHeader() {
	const t = useTranslations("settings");
	const me = useQuery(orpc.members.me.queryOptions());
	if (!me.data) {
		return <Skeleton className="h-24 rounded-2xl lg:h-36" />;
	}
	const { name, reputation, country } = me.data;
	return (
		<section className="flex items-center gap-4 rounded-2xl border border-border bg-linear-to-br from-primary/10 via-card to-card p-4 lg:flex-col lg:items-start lg:gap-3 lg:p-5">
			<span
				aria-hidden="true"
				className="grid size-14 shrink-0 place-items-center rounded-full bg-linear-to-br from-primary to-amber-600 font-bold text-lg text-primary-foreground"
			>
				{initialsOf(name)}
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<p className="truncate font-semibold text-lg">{name}</p>
				<p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-sm">
					{reputation != null && (
						<span className="flex items-center gap-1.5">
							<AwardIcon aria-hidden="true" className="size-4" />
							{t("header.reputation", { value: reputation })}
						</span>
					)}
					{country && (
						<span className="flex items-center gap-1.5">
							<MapPinIcon aria-hidden="true" className="size-4" />
							{country}
						</span>
					)}
				</p>
			</div>
		</section>
	);
}

/** The public profile: one form, one « Enregistrer », a warning when leaving it unsaved. */
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
			});
		}
	}, [me.data]);

	const dirty =
		draft !== undefined &&
		me.data !== undefined &&
		(draft.name !== me.data.name ||
			draft.country !== (me.data.country ?? "") ||
			draft.city !== (me.data.city ?? ""));
	useLeaveWarning(dirty);

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
			onSubmit={(event) => {
				event.preventDefault();
				save.mutate({
					name: draft.name,
					country: draft.country.trim()
						? draft.country.trim().toUpperCase()
						: null,
					city: draft.city.trim() || null,
				});
			}}
		>
			<SettingsSection
				title={t("profile.title")}
				description={t("profile.description")}
			>
				<div className="grid gap-4 pb-1 sm:grid-cols-2">
					<div className="sm:col-span-2">
						<Field id="name" label={t("profile.name")} required>
							<Input
								id="name"
								value={draft.name}
								maxLength={80}
								required
								onChange={(event) => set("name", event.target.value)}
							/>
						</Field>
					</div>
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
				<div className="flex flex-wrap items-center justify-end gap-3 border-border border-t pt-3">
					{dirty && (
						<p role="status" className="text-muted-foreground text-xs">
							{t("unsaved")}
						</p>
					)}
					<Button type="submit" disabled={save.isPending || !dirty}>
						{save.isPending ? t("saving") : t("save")}
					</Button>
				</div>
			</SettingsSection>
		</form>
	);
}

/**
 * A switch that takes effect at once and says so (#292): no « Enregistrer » to forget. It saves one
 * field of the profile and keeps the cached `me` in step.
 */
function ProfileSwitch({
	field,
	title,
	description,
}: {
	field: "cityPublic" | "hideAgentContent";
	title: string;
	description: string;
}) {
	const t = useTranslations("settings");
	const queryClient = useQueryClient();
	const me = useQuery(orpc.members.me.queryOptions());
	const save = useMutation(
		orpc.members.update.mutationOptions({
			onSuccess: (profile) => {
				queryClient.setQueryData(orpc.members.me.queryKey(), (current) =>
					current ? { ...current, ...profile } : undefined,
				);
				toast.success(t("applied"));
			},
			onError: () => toast.error(t("saveFailed")),
		}),
	);
	return (
		<SettingRow title={title} description={description}>
			<Switch
				aria-label={title}
				checked={me.data?.[field] ?? false}
				disabled={!me.data || save.isPending}
				onCheckedChange={(checked) => save.mutate({ [field]: checked })}
			/>
		</SettingRow>
	);
}

/** Reputation, the strongest Tags and the badges (none earned yet: the model has no badges). */
function ReputationPanel() {
	const t = useTranslations("settings.reputation");
	const tProfile = useTranslations("settings.profile");
	const me = useQuery(orpc.members.me.queryOptions());
	const card = useQuery(orpc.talent.mine.queryOptions({ input: {} }));
	const strongest = card.data?.preview.strongestTags ?? [];
	return (
		<div className="grid gap-6 md:grid-cols-2">
			{/* Read only: earned from the Votes and acceptances the Member's work receives (#239). */}
			<section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 md:row-span-2">
				<AwardIcon aria-hidden="true" className="size-5 text-primary" />
				<div className="flex flex-col gap-1">
					<p className="font-medium text-sm">{tProfile("reputation")}</p>
					<p className="font-semibold text-4xl tabular-nums">
						{me.data?.reputation ?? "—"}
					</p>
				</div>
				<p className="text-muted-foreground text-sm">
					{tProfile("reputationHint")}
				</p>
				<Link
					href="/rankings"
					className="mt-auto w-fit font-medium text-primary text-sm hover:underline"
				>
					{t("rankings")}
				</Link>
			</section>
			<section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5">
				<h2 className="font-medium text-sm">{t("strongest")}</h2>
				{strongest.length === 0 ? (
					<p className="text-muted-foreground text-sm">{t("strongestNone")}</p>
				) : (
					<ul className="flex flex-wrap gap-1.5">
						{strongest.map((tag) => (
							<li
								key={tag}
								className="rounded-full border border-border px-3 py-1 text-sm"
							>
								# {tag}
							</li>
						))}
					</ul>
				)}
			</section>
			<section className="flex flex-col gap-2 rounded-2xl border border-border border-dashed p-5">
				<h2 className="font-medium text-sm">{t("badges")}</h2>
				<p className="text-muted-foreground text-sm">{t("badgesNone")}</p>
			</section>
		</div>
	);
}

const TABS = [
	{ key: "profile", icon: UserIcon },
	{ key: "reputation", icon: AwardIcon },
	{ key: "tags", icon: TagIcon },
	{ key: "agents", icon: BotIcon },
	{ key: "data", icon: ShieldIcon },
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
		<main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6">
			<h1 className="font-semibold text-2xl">{t("title")}</h1>
			<Tabs
				value={tab}
				onValueChange={select}
				className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-8"
			>
				{/* The sidebar: who you are, then the tabs. On a phone it is a card and a row of tabs
				    that scrolls sideways, pinned under the site bar; from lg a column that stays put
				    beside the panel. The sticky element is this plain block, never the ScrollArea. */}
				<aside className="sticky top-16 z-10 -mx-4 flex flex-col gap-3 bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-22 lg:mx-0 lg:gap-4 lg:self-start lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
					<div className="max-lg:hidden">
						<ProfileHeader />
					</div>
					<ScrollArea orientation="horizontal" className="w-full">
						<TabsList className="w-max pb-1 lg:w-full lg:flex-col lg:items-stretch lg:rounded-2xl lg:pb-1">
							{TABS.map(({ key, icon: Icon }) => (
								<TabsTrigger
									key={key}
									value={key}
									className="lg:justify-start lg:rounded-xl lg:px-3 lg:py-2"
								>
									<Icon className="size-4" />
									{t(`tabs.${key}`)}
								</TabsTrigger>
							))}
						</TabsList>
					</ScrollArea>
				</aside>
				<div className="min-w-0">
					<div className="mb-6 lg:hidden">
						<ProfileHeader />
					</div>
					<TabsContent value="profile" className="flex flex-col gap-6">
						<ProfileForm />
						<TalentCardSection />
					</TabsContent>
					<TabsContent value="reputation">
						<ReputationPanel />
					</TabsContent>
					{/* Outside the profile form: each has its own actions, and forms do not nest. */}
					<TabsContent value="tags" className="flex flex-col gap-6">
						<TagsSection />
						<FeedPersonalization />
						<SettingsSection title={t("preferences.title")}>
							<ProfileSwitch
								field="hideAgentContent"
								title={t("preferences.hideAgentContent")}
								description={t("preferences.hideAgentContentHint")}
							/>
						</SettingsSection>
					</TabsContent>
					<TabsContent value="agents">
						<AgentsSection />
					</TabsContent>
					<TabsContent value="data" className="flex flex-col gap-6">
						<SettingsSection title={t("privacy.title")}>
							<ProfileSwitch
								field="cityPublic"
								title={t("privacy.cityPublic")}
								description={t("privacy.cityPublicHint")}
							/>
						</SettingsSection>
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
