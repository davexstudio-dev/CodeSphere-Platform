"use client";

import type {
	AdminMember as AdminMemberSchema,
	StaffInvitation as StaffInvitationSchema,
} from "@codesphere/contract";
import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Textarea } from "@codesphere/ui/components/atoms/textarea";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@codesphere/ui/components/molecules/alert";
import { ConfirmTwoStep } from "@codesphere/ui/components/molecules/confirm-two-step";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@codesphere/ui/components/molecules/dialog";
import { Field } from "@codesphere/ui/components/molecules/field";
import { GroupedList } from "@codesphere/ui/components/molecules/grouped-list";
import {
	isReasonValid,
	ReasonField,
} from "@codesphere/ui/components/molecules/reason-field";
import { SegmentedControl } from "@codesphere/ui/components/molecules/segmented-control";
import { AdminMasterDetail } from "@codesphere/ui/components/organisms/admin-master-detail";
import {
	RecordFields,
	RecordSection,
	RecordSheet,
} from "@codesphere/ui/components/organisms/record-sheet";
import { StatStrip } from "@codesphere/ui/components/organisms/stat-strip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ActivityIcon,
	AlertCircleIcon,
	CalendarIcon,
	MailIcon,
	MailPlusIcon,
	ShieldIcon,
	UserCogIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import AdminFrame from "@/components/admin-frame";
import { useAdminIdentity } from "@/components/admin-identity";
import Link from "@/components/link";
import { moderationErrorKey } from "@/lib/admin-moderation";
import {
	daysLeft,
	mayManage,
	offerableRoles,
	parseInviteEmails,
	rolesTo,
	STAFF_GROUPS,
	staffGroup,
} from "@/lib/admin-staff";
import { firstInGroups, useDefaultSelection } from "@/lib/default-selection";
import { client, orpc } from "@/utils/orpc";

type AdminMember = z.infer<typeof AdminMemberSchema>;
type Invitation = z.infer<typeof StaffInvitationSchema>;

const INVITATION_PREFIX = "invitation:";

const initialsOf = (name: string) =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part.charAt(0).toUpperCase())
		.join("") || "?";

export default function StaffPage() {
	const t = useTranslations("admin.staff");
	const identity = useAdminIdentity();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [inviting, setInviting] = useState(false);
	const staff = useQuery(orpc.admin.staff.list.queryOptions());
	const now = new Date();

	const members = staff.data?.members ?? [];
	const invitations = staff.data?.invitations ?? [];
	const selectedMember = members.find((member) => member.id === selectedId);
	const selectedInvitation = invitations.find(
		(invitation) => `${INVITATION_PREFIX}${invitation.id}` === selectedId,
	);
	const mayInvite = offerableRoles(identity?.role).length > 0;
	useDefaultSelection(
		selectedId,
		firstInGroups(members, STAFF_GROUPS, (member) => staffGroup(member.role)),
		setSelectedId,
		staff.isSuccess,
	);

	return (
		<AdminFrame
			title={t("title")}
			description={t("description")}
			actions={
				mayInvite && (
					<Button size="sm" onClick={() => setInviting(true)}>
						<MailPlusIcon />
						{t("invite.button")}
					</Button>
				)
			}
		>
			{staff.isError && (
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertTitle>{t("unavailable")}</AlertTitle>
					<AlertDescription>
						{t(`errors.${moderationErrorKey(staff.error)}`)}{" "}
						<Button variant="link" size="sm" onClick={() => staff.refetch()}>
							{t("retry")}
						</Button>
					</AlertDescription>
				</Alert>
			)}
			{staff.isSuccess && (
				<StatStrip
					className="lg:grid-cols-4"
					items={[
						{ label: t("stats.members"), value: String(members.length) },
						{
							label: t("stats.admins"),
							value: String(
								members.filter(
									(member) =>
										member.role === "admin" || member.role === "super_admin",
								).length,
							),
						},
						{
							label: t("stats.moderators"),
							value: String(
								members.filter((member) => member.role === "moderator").length,
							),
						},
						{
							label: t("stats.pending"),
							value: String(invitations.length),
						},
					]}
				/>
			)}
			<AdminMasterDetail
				detailKey={selectedId}
				list={
					<GroupedList
						label={t("list")}
						searchLabel={t("search")}
						searchPlaceholder={t("searchPlaceholder")}
						emptyText={staff.isPending ? t("loading") : t("empty")}
						groups={STAFF_GROUPS.map((key) => ({
							key,
							label: t(`groups.${key}`),
						}))}
						selectedId={selectedId}
						onSelect={(item) => setSelectedId(item.id)}
						items={[
							...members.map((member) => ({
								id: member.id,
								name: member.name,
								group: staffGroup(member.role),
								keywords: member.email,
								meta: member.suspendedAt ? t("deactivated") : undefined,
							})),
							...invitations.map((invitation) => {
								const days = daysLeft(invitation.expiresAt, now);
								return {
									id: `${INVITATION_PREFIX}${invitation.id}`,
									name: invitation.email,
									group: "pending",
									keywords: invitation.role,
									meta:
										days > 0 ? t("pendingMeta", { days }) : t("expiredMeta"),
								};
							}),
						]}
					/>
				}
				detail={
					selectedMember ? (
						<MemberSheet
							member={selectedMember}
							selfId={identity?.id}
							actorRole={identity?.role}
						/>
					) : selectedInvitation ? (
						<InvitationSheet
							invitation={selectedInvitation}
							actorRole={identity?.role}
							now={now}
							onGone={() => setSelectedId(null)}
						/>
					) : (
						<p className="text-muted-foreground text-sm">{t("pick")}</p>
					)
				}
			/>
			<InviteDialog
				open={inviting}
				onOpenChange={setInviting}
				actorRole={identity?.role}
			/>
		</AdminFrame>
	);
}

/** What every staff action refreshes: the list, and the audit log it writes to. */
function useRefresh() {
	const queryClient = useQueryClient();
	return () => {
		void queryClient.invalidateQueries({ queryKey: orpc.admin.staff.key() });
		void queryClient.invalidateQueries({ queryKey: orpc.admin.members.key() });
		void queryClient.invalidateQueries({
			queryKey: orpc.admin.auditLog.key(),
		});
	};
}

function MemberSheet({
	member,
	selfId,
	actorRole,
}: {
	member: AdminMember;
	selfId?: string;
	actorRole?: string;
}) {
	const t = useTranslations("admin.staff");
	const tc = useTranslations("admin.common");
	const locale = useLocale();
	const refresh = useRefresh();
	const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
	const manage = mayManage(actorRole, member, selfId);
	const roles = rolesTo(actorRole, member, selfId);
	const [nextRole, setNextRole] = useState<string>(roles[0] ?? "");
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);

	const done = (message: string) => {
		setError(null);
		setReason("");
		toast.success(message);
		refresh();
	};
	const failed = (failure: unknown) => {
		setError(t(`errors.${moderationErrorKey(failure)}`));
		refresh();
	};
	const setRole = useMutation(
		orpc.admin.staff.setRole.mutationOptions({
			onSuccess: () => done(t("manage.roleChanged")),
			onError: failed,
		}),
	);
	const suspend = useMutation(
		orpc.admin.members.suspend.mutationOptions({
			onSuccess: () => done(t("deactivated")),
			onError: failed,
		}),
	);
	const reactivate = useMutation(
		orpc.admin.members.reactivate.mutationOptions({
			onSuccess: () => done(t("manage.reactivate")),
			onError: failed,
		}),
	);
	const revoke = useMutation(
		orpc.admin.staff.revokeSessions.mutationOptions({
			onSuccess: () => done(t("manage.sessionsRevoked")),
			onError: failed,
		}),
	);
	const busy =
		setRole.isPending ||
		suspend.isPending ||
		reactivate.isPending ||
		revoke.isPending;
	const confirmLabel = (seconds: number) => tc("confirm", { seconds });

	return (
		<article className="flex min-w-0 flex-col gap-4">
			{/* Identity card, then the account as a bento of small tiles. */}
			<header className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-linear-to-br from-primary/10 via-card to-card p-4 md:p-5">
				<span
					aria-hidden="true"
					className="grid size-12 shrink-0 place-items-center rounded-full bg-linear-to-br from-primary to-amber-600 font-bold text-primary-foreground text-sm"
				>
					{initialsOf(member.name)}
				</span>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="truncate font-semibold text-lg">{member.name}</h2>
						<Badge variant="outline">{t(`roles.${member.role}`)}</Badge>
						{member.suspendedAt && (
							<Badge variant="destructive">{t("deactivated")}</Badge>
						)}
					</div>
					<p className="flex items-center gap-1.5 truncate text-muted-foreground text-sm">
						<MailIcon className="size-3.5 shrink-0" aria-hidden="true" />
						{member.email}
					</p>
				</div>
			</header>
			<dl className="grid gap-3 sm:grid-cols-3">
				{[
					{
						icon: ShieldIcon,
						label: t("account.role"),
						value: t(`roles.${member.role}`),
					},
					{
						icon: CalendarIcon,
						label: t("account.joined"),
						value: dateFormat.format(new Date(member.createdAt)),
					},
					{
						icon: ActivityIcon,
						label: t("account.status"),
						value: member.suspendedAt
							? t("account.suspended")
							: t("account.active"),
					},
				].map(({ icon: Icon, label, value }) => (
					<div
						key={label}
						className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3"
					>
						<dt className="flex items-center gap-1.5 text-muted-foreground text-xs">
							<Icon className="size-3.5" aria-hidden="true" />
							{label}
						</dt>
						<dd className="font-medium text-sm">{value}</dd>
					</div>
				))}
			</dl>
			{error && (
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			{!manage.ok &&
				(manage.reason === "self" ? (
					<p className="flex flex-wrap items-center gap-2 rounded-lg border border-border border-dashed p-3 text-muted-foreground text-sm">
						<UserCogIcon className="size-4" aria-hidden="true" />
						{t("manage.refusalSelf")}
						<Link
							href="/admin/account"
							className="font-medium text-primary hover:underline"
						>
							{t("manage.openAccount")}
						</Link>
					</p>
				) : (
					<p className="text-muted-foreground text-sm">
						{t("manage.refusalRank")}
					</p>
				))}
			{roles.length > 0 && (
				<RecordSection title={t("manage.roleSection")}>
					<Field id="staff-new-role" label={t("manage.newRole")}>
						<SegmentedControl
							options={roles}
							value={
								(roles.includes(nextRole as never)
									? nextRole
									: roles[0]) as (typeof roles)[number]
							}
							onValueChange={setNextRole}
							labels={Object.fromEntries(
								roles.map((role) => [role, t(`roles.${role}`)]),
							)}
							aria-label={t("manage.newRole")}
						/>
					</Field>
					<ReasonField
						id="staff-role-reason"
						label={t("manage.reasonLabel")}
						tooShortText={t("manage.reasonTooShort")}
						value={reason}
						onValueChange={setReason}
					/>
					<ConfirmTwoStep
						label={t("manage.applyRole")}
						confirmLabel={confirmLabel}
						cancelLabel={tc("cancel")}
						disabled={busy || !isReasonValid(reason)}
						onConfirm={() =>
							setRole.mutate({
								id: member.id,
								role: (roles.includes(nextRole as never)
									? nextRole
									: roles[0]) as (typeof roles)[number],
								reason,
							})
						}
					/>
				</RecordSection>
			)}
			{manage.ok && (
				<RecordSection title={t("manage.accessSection")}>
					{member.suspendedAt ? (
						<Button
							variant="outline"
							className="self-start"
							disabled={busy}
							onClick={() => reactivate.mutate({ id: member.id })}
						>
							{t("manage.reactivate")}
						</Button>
					) : (
						<ConfirmTwoStep
							label={t("manage.deactivate")}
							confirmLabel={confirmLabel}
							cancelLabel={tc("cancel")}
							disabled={busy || !isReasonValid(reason)}
							onConfirm={() => suspend.mutate({ id: member.id, reason })}
						/>
					)}
					<ConfirmTwoStep
						label={t("manage.revokeSessions")}
						confirmLabel={confirmLabel}
						cancelLabel={tc("cancel")}
						disabled={busy}
						onConfirm={() => revoke.mutate({ id: member.id })}
					/>
				</RecordSection>
			)}
		</article>
	);
}

function InvitationSheet({
	invitation,
	actorRole,
	now,
	onGone,
}: {
	invitation: Invitation;
	actorRole?: string;
	now: Date;
	onGone: () => void;
}) {
	const t = useTranslations("admin.staff");
	const tc = useTranslations("admin.common");
	const locale = useLocale();
	const refresh = useRefresh();
	const [error, setError] = useState<string | null>(null);
	const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
	const days = daysLeft(invitation.expiresAt, now);
	const may = offerableRoles(actorRole).includes(invitation.role);

	const resend = useMutation(
		orpc.admin.staff.resendInvitation.mutationOptions({
			onSuccess: (out) => {
				setError(null);
				toast.success(
					out.emailSent ? t("invitation.resent") : t("invitation.resentNoMail"),
				);
				refresh();
			},
			onError: (failure) => {
				setError(t(`errors.${moderationErrorKey(failure)}`));
				refresh();
			},
		}),
	);
	const revoke = useMutation(
		orpc.admin.staff.revokeInvitation.mutationOptions({
			onSuccess: () => {
				toast.success(t("invitation.revoked"));
				refresh();
				onGone();
			},
			onError: (failure) => {
				setError(t(`errors.${moderationErrorKey(failure)}`));
				refresh();
			},
		}),
	);

	return (
		<RecordSheet
			title={invitation.email}
			badges={
				<>
					<Badge variant="outline">{t(`roles.${invitation.role}`)}</Badge>
					<Badge variant={days > 0 ? "secondary" : "destructive"}>
						{days > 0 ? t("invitation.leftDays", { days }) : t("expiredMeta")}
					</Badge>
				</>
			}
		>
			<RecordSection title={t("invitation.section")}>
				<RecordFields
					fields={[
						{ label: t("invitation.email"), value: invitation.email },
						{
							label: t("invitation.role"),
							value: t(`roles.${invitation.role}`),
						},
						{
							label: t("invitation.invitedBy"),
							value: invitation.invitedBy ?? t("invitation.unknownInviter"),
						},
						{
							label: t("invitation.sent"),
							value: dateFormat.format(new Date(invitation.createdAt)),
						},
						{
							label: t("invitation.expires"),
							value:
								days > 0
									? dateFormat.format(new Date(invitation.expiresAt))
									: t("invitation.expired"),
						},
					]}
				/>
			</RecordSection>
			{error && (
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			{may && (
				<RecordSection title={t("manage.accessSection")}>
					<Button
						variant="outline"
						className="self-start"
						disabled={resend.isPending || revoke.isPending}
						onClick={() => resend.mutate({ id: invitation.id })}
					>
						{t("invitation.resend")}
					</Button>
					<ConfirmTwoStep
						label={t("invitation.revoke")}
						confirmLabel={(seconds) => tc("confirm", { seconds })}
						cancelLabel={tc("cancel")}
						disabled={resend.isPending || revoke.isPending}
						onConfirm={() => revoke.mutate({ id: invitation.id })}
					/>
				</RecordSection>
			)}
		</RecordSheet>
	);
}

function InviteDialog({
	open,
	onOpenChange,
	actorRole,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	actorRole?: string;
}) {
	const t = useTranslations("admin.staff");
	const refresh = useRefresh();
	const roles = offerableRoles(actorRole);
	const [text, setText] = useState("");
	const [role, setRole] = useState<string>(roles[0] ?? "moderator");
	const [sending, setSending] = useState(false);
	const [results, setResults] = useState<
		{ email: string; status: string; emailSent: boolean }[] | null
	>(null);
	const [error, setError] = useState<string | null>(null);
	const parsed = parseInviteEmails(text);
	const chosen = (roles.includes(role as never) ? role : roles[0]) as
		| (typeof roles)[number]
		| undefined;

	const close = (next: boolean) => {
		onOpenChange(next);
		if (!next) {
			setText("");
			setResults(null);
			setError(null);
		}
	};
	const send = async () => {
		if (!chosen || parsed.valid.length === 0) {
			return;
		}
		setSending(true);
		setError(null);
		try {
			const out = await client.admin.staff.invite({
				emails: parsed.valid,
				role: chosen,
			});
			setResults(out.results);
			refresh();
		} catch (failure) {
			setError(t(`errors.${moderationErrorKey(failure)}`));
		} finally {
			setSending(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("invite.title")}</DialogTitle>
					<DialogDescription>{t("invite.description")}</DialogDescription>
				</DialogHeader>
				{results ? (
					<>
						<h3 className="font-medium text-sm">{t("invite.resultsTitle")}</h3>
						<ul className="flex flex-col gap-1.5 text-sm">
							{results.map((result) => (
								<li
									key={result.email}
									className="flex flex-wrap items-center justify-between gap-2"
								>
									<span className="min-w-0 truncate">{result.email}</span>
									<span className="flex items-center gap-2">
										{result.status === "invited" && !result.emailSent && (
											<span className="text-muted-foreground text-xs">
												{t("invite.emailNotSent")}
											</span>
										)}
										<Badge
											variant={
												result.status === "refused" ? "destructive" : "outline"
											}
										>
											{t(`invite.status.${result.status}`)}
										</Badge>
									</span>
								</li>
							))}
						</ul>
						<DialogFooter>
							<Button onClick={() => close(false)}>{t("invite.done")}</Button>
						</DialogFooter>
					</>
				) : (
					<>
						{error && (
							<Alert variant="destructive">
								<AlertCircleIcon />
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<Field
							id="staff-invite-emails"
							label={t("invite.emails")}
							description={t("invite.emailsHelp")}
						>
							<Textarea
								id="staff-invite-emails"
								rows={4}
								value={text}
								placeholder="awa@example.com, koffi@example.com"
								onChange={(event) => setText(event.target.value)}
							/>
						</Field>
						<p aria-live="polite" className="text-muted-foreground text-xs">
							{parsed.valid.length > 0 &&
								t("invite.count", { count: parsed.valid.length })}
							{parsed.invalid.length > 0 &&
								` · ${t("invite.invalid", { emails: parsed.invalid.join(", ") })}`}
							{parsed.overflow.length > 0 &&
								` · ${t("invite.overflow", { count: parsed.overflow.length })}`}
						</p>
						{roles.length > 1 && (
							<Field id="staff-invite-role" label={t("invite.role")}>
								<SegmentedControl
									options={roles}
									value={chosen ?? roles[0] ?? "moderator"}
									onValueChange={setRole}
									labels={Object.fromEntries(
										roles.map((r) => [r, t(`roles.${r}`)]),
									)}
									aria-label={t("invite.role")}
								/>
							</Field>
						)}
						<DialogFooter>
							<Button
								disabled={sending || parsed.valid.length === 0 || !chosen}
								onClick={() => void send()}
							>
								{sending ? t("invite.sending") : t("invite.submit")}
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
