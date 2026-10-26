"use client";

import type { AdminMember as AdminMemberSchema } from "@codesphere/contract";
import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@codesphere/ui/components/molecules/alert";
import { ConfirmTwoStep } from "@codesphere/ui/components/molecules/confirm-two-step";
import { GroupedList } from "@codesphere/ui/components/molecules/grouped-list";
import {
	isReasonValid,
	ReasonField,
} from "@codesphere/ui/components/molecules/reason-field";
import { AdminMasterDetail } from "@codesphere/ui/components/organisms/admin-master-detail";
import {
	RecordFields,
	RecordSection,
	RecordSheet,
} from "@codesphere/ui/components/organisms/record-sheet";
import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { AlertCircleIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { z } from "zod";

import AdminFrame from "@/components/admin-frame";
import { useAdminIdentity } from "@/components/admin-identity";
import {
	canModerate,
	type MemberGroup,
	memberGroup,
	moderationErrorKey,
} from "@/lib/admin-moderation";
import { orpc } from "@/utils/orpc";

type AdminMember = z.infer<typeof AdminMemberSchema>;

const GROUPS: MemberGroup[] = ["active", "agents", "suspended"];

type ErrorKey = ReturnType<typeof moderationErrorKey>;

export default function ModerationPage() {
	const t = useTranslations("admin.moderation");
	const identity = useAdminIdentity();
	const queryClient = useQueryClient();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [reason, setReason] = useState("");
	const [error, setError] = useState<ErrorKey | null>(null);
	const [status, setStatus] = useState<"active" | "suspended" | undefined>();

	const members = useInfiniteQuery(
		orpc.admin.members.list.infiniteOptions({
			input: (cursor: string | undefined) => ({ limit: 50, cursor, status }),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (page) => page.nextCursor ?? undefined,
		}),
	);
	const items = members.data?.pages.flatMap((page) => page.items) ?? [];
	const selected = items.find((member) => member.id === selectedId) ?? null;

	// A suspension lands in the audit log: refresh it too, so it shows without a manual reload.
	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey: orpc.admin.members.key() });
		void queryClient.invalidateQueries({
			queryKey: orpc.admin.auditLog.key(),
		});
	};
	const onDone = () => {
		setError(null);
		setReason("");
		refresh();
	};
	const onFailed = (failure: unknown) => {
		setError(moderationErrorKey(failure));
		refresh();
	};
	const suspend = useMutation(
		orpc.admin.members.suspend.mutationOptions({
			onSuccess: onDone,
			onError: onFailed,
		}),
	);
	const reactivate = useMutation(
		orpc.admin.members.reactivate.mutationOptions({
			onSuccess: onDone,
			onError: onFailed,
		}),
	);

	return (
		<AdminFrame title={t("title")} description={t("description")}>
			{members.isError && (
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertTitle>{t("unavailable")}</AlertTitle>
					<AlertDescription>
						{t(`errors.${moderationErrorKey(members.error)}`)}{" "}
						<Button variant="link" size="sm" onClick={() => members.refetch()}>
							{t("retry")}
						</Button>
					</AlertDescription>
				</Alert>
			)}
			<AdminMasterDetail
				detailKey={selected?.id}
				list={
					<>
						<fieldset className="mb-2 flex gap-1 border-0 p-0">
							<legend className="sr-only">{t("status.label")}</legend>
							{(
								[
									[undefined, "all"],
									["active", "active"],
									["suspended", "suspended"],
								] as const
							).map(([value, label]) => (
								<Button
									key={label}
									size="sm"
									variant={status === value ? "default" : "outline"}
									aria-pressed={status === value}
									onClick={() => setStatus(value)}
								>
									{t(`status.${label}`)}
								</Button>
							))}
						</fieldset>
						<GroupedList
							label={t("list")}
							searchLabel={t("search")}
							searchPlaceholder={t("searchPlaceholder")}
							emptyText={members.isPending ? t("loading") : t("empty")}
							groups={GROUPS.map((key) => ({ key, label: t(`groups.${key}`) }))}
							selectedId={selectedId}
							onSelect={(member) => {
								setSelectedId(member.id);
								setReason("");
								setError(null);
							}}
							items={items.map((member) => ({
								id: member.id,
								name: member.name,
								group: memberGroup(member),
								keywords: member.email,
								meta: member.suspendedAt ? t("suspended") : undefined,
							}))}
						/>
						{members.hasNextPage && (
							<Button
								variant="outline"
								size="sm"
								className="mt-2"
								disabled={members.isFetchingNextPage}
								onClick={() => members.fetchNextPage()}
							>
								{members.isFetchingNextPage ? t("loading") : t("more")}
							</Button>
						)}
					</>
				}
				detail={
					selected ? (
						<MemberSheet
							member={selected}
							selfId={identity?.id}
							actorRole={identity?.role}
							reason={reason}
							onReasonChange={setReason}
							error={error ? t(`errors.${error}`) : undefined}
							busy={suspend.isPending || reactivate.isPending}
							onSuspend={() => suspend.mutate({ id: selected.id, reason })}
							onReactivate={() => reactivate.mutate({ id: selected.id })}
						/>
					) : (
						<p className="text-muted-foreground text-sm">{t("pick")}</p>
					)
				}
			/>
		</AdminFrame>
	);
}

function MemberSheet({
	member,
	selfId,
	actorRole,
	reason,
	onReasonChange,
	error,
	busy,
	onSuspend,
	onReactivate,
}: {
	member: AdminMember;
	selfId?: string;
	actorRole?: string;
	reason: string;
	onReasonChange: (reason: string) => void;
	error?: string;
	busy: boolean;
	onSuspend: () => void;
	onReactivate: () => void;
}) {
	const t = useTranslations("admin.moderation");
	const tc = useTranslations("admin.common");
	const locale = useLocale();
	const dateFormat = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});
	const permission = canModerate(member, selfId, actorRole);
	const refusal = permission.ok
		? undefined
		: permission.reason === "self"
			? t("refusal.self")
			: t("refusal.rank");
	return (
		<RecordSheet
			title={member.name}
			badges={
				<>
					<Badge variant="outline">{t(`kind.${member.kind}`)}</Badge>
					{member.suspendedAt && (
						<Badge variant="destructive">{t("suspended")}</Badge>
					)}
				</>
			}
		>
			<RecordSection title={t("account")}>
				<RecordFields
					fields={[
						{ label: t("email"), value: member.email },
						{ label: t("role"), value: member.role },
						{
							label: t("joined"),
							value: dateFormat.format(new Date(member.createdAt)),
						},
						...(member.suspendedAt
							? [
									{
										label: t("suspendedOn"),
										value: dateFormat.format(new Date(member.suspendedAt)),
									},
									{
										label: t("reason"),
										value: member.suspensionReason ?? "—",
									},
								]
							: []),
					]}
				/>
			</RecordSection>
			<RecordSection title={t("moderate")}>
				{error && (
					<Alert variant="destructive">
						<AlertCircleIcon />
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				{refusal && <p className="text-muted-foreground text-sm">{refusal}</p>}
				{member.suspendedAt ? (
					<Button
						variant="outline"
						className="self-start"
						disabled={busy || !permission.ok}
						onClick={onReactivate}
					>
						{t("reactivate")}
					</Button>
				) : (
					<>
						<ReasonField
							id="suspend-reason"
							label={t("reasonLabel")}
							tooShortText={t("reasonTooShort")}
							value={reason}
							onValueChange={onReasonChange}
						/>
						<ConfirmTwoStep
							label={t("suspend")}
							confirmLabel={(seconds) => tc("confirm", { seconds })}
							cancelLabel={tc("cancel")}
							disabled={busy || !permission.ok || !isReasonValid(reason)}
							onConfirm={onSuspend}
						/>
					</>
				)}
			</RecordSection>
		</RecordSheet>
	);
}
