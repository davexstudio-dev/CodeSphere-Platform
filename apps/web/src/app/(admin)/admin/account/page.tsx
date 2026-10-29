"use client";

import { roleCan } from "@codesphere/auth/access";
import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { InitialsAvatar } from "@codesphere/ui/components/atoms/initials-avatar";
import { Input } from "@codesphere/ui/components/atoms/input";
import { ScrollArea } from "@codesphere/ui/components/molecules/scroll-area";
import { SegmentedControl } from "@codesphere/ui/components/molecules/segmented-control";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@codesphere/ui/components/molecules/tabs";
import {
	RecordFields,
	RecordSection,
} from "@codesphere/ui/components/organisms/record-sheet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	BadgeCheckIcon,
	CalendarIcon,
	HistoryIcon,
	MailIcon,
	ShieldCheckIcon,
	SlidersHorizontalIcon,
	UserIcon,
} from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useState } from "react";
import { toast } from "sonner";
import AdminFrame, { ADMIN_NAV } from "@/components/admin-frame";
import { useAdminIdentity } from "@/components/admin-identity";
import { DataSaverToggle } from "@/components/data-saver";
import Link from "@/components/link";
import LocaleSwitcher from "@/components/locale-switcher";
import { useSignOut } from "@/components/outbox-provider";
import { auditActionMessageKey } from "@/lib/audit-target";
import { authClient } from "@/lib/auth-client";
import { describeUserAgent } from "@/lib/user-agent";
import { orpc } from "@/utils/orpc";

const NAME_MAX = 80;

/** « Mon compte » (#286): the signed-in staff member's profile, preferences, sessions and recent activity. */
export default function AccountPage() {
	const t = useTranslations("admin.account");
	const tRole = useTranslations("admin.staff.roles");
	const locale = useLocale();
	const identity = useAdminIdentity();
	const current = authClient.useSession();
	const role =
		identity?.role === "super_admin" ||
		identity?.role === "admin" ||
		identity?.role === "moderator"
			? identity.role
			: "member";
	const day = new Intl.DateTimeFormat(locale, { dateStyle: "long" });
	const moment = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});

	return (
		<AdminFrame title={t("title")} description={t("description")}>
			<div className="flex flex-col gap-6">
				<section className="flex flex-col gap-4 rounded-xl border border-border bg-linear-to-br from-primary/10 via-card to-card p-4 sm:flex-row sm:items-center sm:gap-5 md:p-6">
					<div className="flex items-center gap-3 sm:contents">
						<InitialsAvatar name={identity?.name ?? ""} size="xl" ringed />
						{/* On a phone the name and the role sit beside the avatar; the details go below. */}
						<div className="flex min-w-0 flex-col items-start gap-1 sm:hidden">
							<h2 className="truncate font-semibold text-xl tracking-tight">
								{identity?.name ?? "—"}
							</h2>
							<Badge variant="outline">{tRole(role)}</Badge>
						</div>
					</div>
					<div className="flex min-w-0 flex-1 flex-col gap-2">
						<div className="hidden flex-wrap items-center gap-2 sm:flex">
							<h2 className="truncate font-semibold text-2xl tracking-tight">
								{identity?.name ?? "—"}
							</h2>
							<Badge variant="outline">{tRole(role)}</Badge>
						</div>
						<ul className="flex flex-col gap-1.5 text-muted-foreground text-sm sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-1">
							<li className="flex min-w-0 items-center gap-1.5">
								<MailIcon className="size-3.5 shrink-0" aria-hidden="true" />
								<span className="truncate">{identity?.email ?? "—"}</span>
							</li>
							{identity && (
								<li className="flex items-center gap-1.5">
									<BadgeCheckIcon className="size-3.5" aria-hidden="true" />
									{identity.emailVerified
										? t("hero.verified")
										: t("hero.unverified")}
								</li>
							)}
							{identity && (
								<li className="flex items-center gap-1.5">
									<CalendarIcon className="size-3.5" aria-hidden="true" />
									{t("hero.memberSince", {
										date: day.format(new Date(identity.createdAt)),
									})}
								</li>
							)}
						</ul>
						{current.data && (
							<p className="text-muted-foreground text-xs">
								{t("hero.lastSignIn", {
									date: moment.format(new Date(current.data.session.createdAt)),
								})}
							</p>
						)}
					</div>
				</section>
				{/* One tab per section, so the page stays one screen high; the profile tab is a bento of
				    the form and the access. */}
				<Tabs defaultValue="profile" className="gap-6">
					<ScrollArea orientation="horizontal" className="w-full min-w-0">
						<TabsList className="mb-3">
							<TabsTrigger value="profile">
								<UserIcon />
								{t("tabs.profile")}
							</TabsTrigger>
							<TabsTrigger value="security">
								<ShieldCheckIcon />
								{t("tabs.security")}
							</TabsTrigger>
							<TabsTrigger value="activity">
								<HistoryIcon />
								{t("tabs.activity")}
							</TabsTrigger>
							<TabsTrigger value="preferences">
								<SlidersHorizontalIcon />
								{t("tabs.preferences")}
							</TabsTrigger>
						</TabsList>
					</ScrollArea>
					<TabsContent value="profile">
						<div className="grid items-start gap-6 xl:grid-cols-3">
							<ProfileForm className="xl:col-span-2" />
							<Access role={identity?.role} />
						</div>
					</TabsContent>
					<TabsContent value="security">
						<Sessions />
					</TabsContent>
					<TabsContent value="activity">
						<Activity selfId={identity?.id} />
					</TabsContent>
					<TabsContent value="preferences">
						<Preferences />
					</TabsContent>
				</Tabs>
			</div>
		</AdminFrame>
	);
}

/** The name is the one field that is the member's own: the email and the role come from elsewhere. */
function ProfileForm({ className }: { className?: string }) {
	const t = useTranslations("admin.account.profile");
	const tRole = useTranslations("admin.staff.roles");
	const locale = useLocale();
	const router = useRouter();
	const identity = useAdminIdentity();
	const accounts = useQuery({
		queryKey: ["account", "providers"],
		queryFn: async () => {
			const out = await authClient.listAccounts();
			return out.data ?? [];
		},
	});
	const [name, setName] = useState(identity?.name ?? "");
	const [busy, setBusy] = useState(false);
	if (!identity) {
		return null;
	}
	const trimmed = name.trim();
	const valid = trimmed.length >= 1 && trimmed.length <= NAME_MAX;
	const changed = trimmed !== identity.name;
	const role =
		identity.role === "super_admin" ||
		identity.role === "admin" ||
		identity.role === "moderator"
			? identity.role
			: "member";
	const methods = [
		...new Set((accounts.data ?? []).map((account) => account.providerId)),
	].map((id) => (t.has(`providers.${id}`) ? t(`providers.${id}`) : id));

	const save = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!valid || !changed) {
			return;
		}
		setBusy(true);
		try {
			const out = await authClient.updateUser({ name: trimmed });
			if (out.error) {
				toast.error(t("failed"));
				return;
			}
			toast.success(t("saved"));
			// The identity is read on the server by the layout: read it again.
			router.refresh();
		} catch {
			toast.error(t("failed"));
		} finally {
			setBusy(false);
		}
	};

	return (
		<RecordSection title={t("title")} className={className}>
			<form onSubmit={save} className="flex flex-col gap-1.5">
				<label htmlFor="account-name" className="font-medium text-sm">
					{t("name")}
				</label>
				<div className="flex flex-wrap items-start gap-2">
					<Input
						id="account-name"
						value={name}
						maxLength={NAME_MAX}
						autoComplete="name"
						aria-invalid={!valid}
						aria-describedby="account-name-hint"
						onChange={(event) => setName(event.target.value)}
						textSize="sm"
						className="h-9 max-w-sm flex-1"
					/>
					<Button type="submit" disabled={busy || !valid || !changed}>
						{busy ? t("saving") : t("save")}
					</Button>
				</div>
				<p
					id="account-name-hint"
					className={
						valid ? "text-muted-foreground text-xs" : "text-destructive text-xs"
					}
				>
					{valid ? t("nameHint") : t("invalid")}
				</p>
			</form>
			<div className="mt-2 border-border border-t pt-3">
				<RecordFields
					fields={[
						{ label: t("email"), value: identity.email },
						{
							label: t("role"),
							value: <Badge variant="outline">{tRole(role)}</Badge>,
						},
						{
							label: t("memberSince"),
							value: new Intl.DateTimeFormat(locale, {
								dateStyle: "long",
							}).format(new Date(identity.createdAt)),
						},
						{
							label: t("signIn"),
							value: accounts.isSuccess
								? methods.length > 0
									? methods.join(", ")
									: t("emailCode")
								: "…",
						},
					]}
				/>
			</div>
			<p className="text-muted-foreground text-xs">{t("emailHint")}</p>
		</RecordSection>
	);
}

/** What the role opens, from the same table the sidebar is drawn with. */
function Access({ role }: { role?: string }) {
	const t = useTranslations("admin.account.access");
	const tAdmin = useTranslations("admin");
	const screens = ADMIN_NAV.filter((item) => roleCan(role, item.can));
	return (
		<RecordSection title={t("title")}>
			<p className="text-muted-foreground text-sm">{t("description")}</p>
			<ul className="flex flex-wrap gap-1.5">
				{screens.map((screen) => (
					<li key={screen.href}>
						<Link
							href={screen.href as Route}
							className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
						>
							<screen.icon className="size-3.5 text-muted-foreground" />
							{tAdmin(screen.key)}
						</Link>
					</li>
				))}
			</ul>
			<p className="text-muted-foreground text-xs">
				{t("count", { count: screens.length })}
			</p>
		</RecordSection>
	);
}

const THEMES = ["light", "dark", "system"] as const;

function Preferences() {
	const t = useTranslations("admin.account.preferences");
	const tMenu = useTranslations("admin.userMenu.themes");
	const { theme, setTheme } = useTheme();
	const value = THEMES.find((item) => item === theme) ?? "system";
	return (
		<RecordSection title={t("title")} className="max-w-2xl">
			<div className="flex flex-col items-start gap-1.5">
				<span className="font-medium text-sm">{t("language")}</span>
				<LocaleSwitcher />
			</div>
			<div className="flex flex-col items-start gap-1.5">
				<span className="font-medium text-sm">{t("theme")}</span>
				<SegmentedControl
					options={THEMES}
					value={value}
					onValueChange={setTheme}
					labels={{
						light: tMenu("light"),
						dark: tMenu("dark"),
						system: tMenu("system"),
					}}
					aria-label={t("theme")}
				/>
			</div>
			{/* Its own label (« Données allégées »), moved here from the foot of every page. */}
			<DataSaverToggle className="flex flex-col items-start gap-1.5 font-medium text-sm" />
		</RecordSection>
	);
}

function Sessions() {
	const t = useTranslations("admin.account.sessions");
	const locale = useLocale();
	const queryClient = useQueryClient();
	const [busy, setBusy] = useState(false);
	const current = authClient.useSession();
	const signOut = useSignOut();
	const sessions = useQuery({
		retry: false,
		queryKey: ["account", "sessions"],
		queryFn: async () => {
			const out = await authClient.listSessions();
			if (out.error) {
				// Better Auth only lists the sessions of a fresh one (signed in under a day ago).
				throw new Error(out.error.code ?? out.error.message);
			}
			return out.data ?? [];
		},
	});
	const dateFormat = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});
	const currentToken = current.data?.session.token;
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: ["account", "sessions"] });

	const run = async (
		action: () => Promise<{ error: unknown }>,
		done: string,
	) => {
		setBusy(true);
		try {
			const out = await action();
			if (out.error) {
				toast.error(t("failed"));
			} else {
				toast.success(done);
			}
		} catch {
			toast.error(t("failed"));
		} finally {
			setBusy(false);
			void refresh();
		}
	};
	const others = (sessions.data ?? []).filter(
		(session) => session.token !== currentToken,
	);

	return (
		<RecordSection title={t("title")}>
			{sessions.isPending ? (
				<p className="text-muted-foreground text-sm">{t("loading")}</p>
			) : sessions.isError ? (
				sessions.error.message === "SESSION_NOT_FRESH" ? (
					<div className="flex flex-col items-start gap-3">
						<p className="text-muted-foreground text-sm">{t("stale")}</p>
						<Button
							variant="outline"
							onClick={() =>
								void signOut(() => {
									window.location.assign("/signin");
								})
							}
						>
							{t("reauth")}
						</Button>
					</div>
				) : (
					<p className="text-destructive text-sm">{t("error")}</p>
				)
			) : (
				<ul className="flex flex-col divide-y divide-border">
					{sessions.data.map((session) => {
						const isCurrent = session.token === currentToken;
						return (
							<li
								key={session.id}
								className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
							>
								<span className="flex min-w-0 flex-col">
									<span className="flex items-center gap-2 font-medium text-sm">
										{describeUserAgent(session.userAgent) ?? t("unknownDevice")}
										{isCurrent && (
											<Badge variant="secondary">{t("current")}</Badge>
										)}
									</span>
									<span className="text-muted-foreground text-xs">
										{t("started", {
											date: dateFormat.format(new Date(session.createdAt)),
										})}
									</span>
								</span>
								{!isCurrent && (
									<Button
										variant="outline"
										size="sm"
										disabled={busy}
										onClick={() =>
											void run(
												() =>
													authClient.revokeSession({ token: session.token }),
												t("revoked"),
											)
										}
									>
										{t("revoke")}
									</Button>
								)}
							</li>
						);
					})}
				</ul>
			)}
			{sessions.isSuccess &&
				(others.length > 0 ? (
					<Button
						variant="outline"
						className="self-start"
						disabled={busy}
						onClick={() =>
							void run(
								() => authClient.revokeOtherSessions(),
								t("othersRevoked"),
							)
						}
					>
						{t("revokeOthers")}
					</Button>
				) : (
					<p className="text-muted-foreground text-xs">{t("onlyThis")}</p>
				))}
		</RecordSection>
	);
}

function Activity({ selfId }: { selfId?: string }) {
	const t = useTranslations("admin.account.activity");
	const tAudit = useTranslations("admin.audit");
	const locale = useLocale();
	const log = useQuery({
		...orpc.admin.auditLog.list.queryOptions({
			input: { limit: 10, actorId: selfId },
		}),
		enabled: Boolean(selfId),
	});
	const dateFormat = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});

	return (
		<RecordSection title={t("title")}>
			<p className="text-muted-foreground text-sm">{t("description")}</p>
			{log.isPending ? (
				<p className="text-muted-foreground text-sm">{t("loading")}</p>
			) : log.isError ? (
				<p className="text-destructive text-sm">{t("unavailable")}</p>
			) : log.data.items.length === 0 ? (
				<p className="text-muted-foreground text-sm">{t("empty")}</p>
			) : (
				<ul className="flex flex-col divide-y divide-border">
					{log.data.items.map((event) => {
						const key = auditActionMessageKey(event.action);
						return (
							<li
								key={event.id}
								className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
							>
								<span className="text-sm">
									{tAudit.has(key) ? tAudit(key) : event.action}
									{event.targetId && (
										<span className="ml-2 text-muted-foreground text-xs">
											{event.targetType}
										</span>
									)}
								</span>
								<span className="font-mono text-muted-foreground text-xs">
									{dateFormat.format(new Date(event.createdAt))}
								</span>
							</li>
						);
					})}
				</ul>
			)}
			<Button
				variant="link"
				size="inline"
				className="self-start"
				render={<Link href="/admin/audit" />}
			>
				{t("full")}
			</Button>
		</RecordSection>
	);
}
