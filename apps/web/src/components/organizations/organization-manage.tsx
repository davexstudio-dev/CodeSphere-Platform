"use client";

import type {
	MyOrganization,
	OrganizationInvitation,
} from "@codesphere/contract";
import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@codesphere/ui/components/molecules/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { CreateHackathon } from "@/components/hackathon/create-hackathon";
import SsoLoginDialog from "@/components/sso-login-dialog";
import { errorCodeOf } from "@/i18n/errors";
import { authClient } from "@/lib/auth-client";
import { memberIdFrom } from "@/lib/organization-team";
import { orpc } from "@/utils/orpc";

type Translate = ReturnType<typeof useTranslations>;

const failure = (t: Translate, error: unknown) => {
	const code = errorCodeOf(error);
	toast.error(
		code === "CONFLICT"
			? t("errors.conflict")
			: code === "FORBIDDEN"
				? t("errors.forbidden")
				: code === "NOT_FOUND"
					? t("errors.notFound")
					: t("errors.generic"),
	);
};

/** The space of an Organization's team (#326): its members and its Hackathons. */
export function OrganizationManage({ slug }: { slug: string }) {
	const t = useTranslations("organizations.manage");
	const { data: session, isPending } = authClient.useSession();
	const [signingIn, setSigningIn] = useState(false);
	const mine = useQuery({
		...orpc.organizations.mine.queryOptions({ input: {} }),
		enabled: Boolean(session),
	});
	const org = mine.data?.items.find((item) => item.slug === slug);

	if (isPending || (session && mine.isPending)) {
		return <main className="mx-auto max-w-3xl px-4 py-10" aria-busy="true" />;
	}
	if (!session) {
		return (
			<main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-10 md:px-8">
				<p className="text-muted-foreground">{t("signIn")}</p>
				<Button className="w-fit" onClick={() => setSigningIn(true)}>
					{t("signInAction")}
				</Button>
				<SsoLoginDialog open={signingIn} onOpenChange={setSigningIn} />
			</main>
		);
	}
	if (!org || org.status !== "validated") {
		return (
			<main className="mx-auto max-w-3xl px-4 py-10 md:px-8">
				<p className="text-muted-foreground">{t("notFound")}</p>
			</main>
		);
	}

	return (
		<main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 md:px-8">
			<header className="flex flex-col gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<h1 className="font-semibold text-3xl">{org.name}</h1>
					<Badge variant="secondary">{t(`role.${org.myRole}`)}</Badge>
				</div>
				<a
					href={`/organizations/${org.slug}`}
					className="text-muted-foreground text-sm hover:underline"
				>
					{t("publicProfile")}
				</a>
			</header>
			<Tabs defaultValue="hackathons">
				<TabsList>
					<TabsTrigger value="hackathons">{t("tabs.hackathons")}</TabsTrigger>
					<TabsTrigger value="members">{t("tabs.members")}</TabsTrigger>
					<TabsTrigger value="terms">{t("tabs.terms")}</TabsTrigger>
				</TabsList>
				<TabsContent value="hackathons">
					<HackathonsTab org={org} />
				</TabsContent>
				<TabsContent value="terms">
					<TermsTab org={org} />
				</TabsContent>
				<TabsContent value="members">
					<MembersTab org={org} selfId={session.user.id} />
				</TabsContent>
			</Tabs>
		</main>
	);
}

const NEXT_ACTION = {
	draft: "publish",
	published: "end",
	ended: "archive",
} as const;

/** The terms the Organization accepts before publishing, and who accepted them (#326). */
function TermsTab({ org }: { org: MyOrganization }) {
	const t = useTranslations("organizations.manage");
	const format = useFormatter();
	const queryClient = useQueryClient();
	const terms = useQuery(
		orpc.organizations.hackathons.terms.get.queryOptions({
			input: { organizationId: org.id },
		}),
	);
	const accept = useMutation(
		orpc.organizations.hackathons.terms.accept.mutationOptions({
			onSuccess: () => {
				toast.success(t("terms.acceptedToast"));
				void queryClient.invalidateQueries({
					queryKey: orpc.organizations.hackathons.terms.key(),
				});
			},
			onError: (error) => failure(t, error),
		}),
	);
	const clauses = ["c1", "c2", "c3", "c4", "c5", "c6"] as const;

	return (
		<section className="grid gap-4" aria-labelledby="org-terms">
			<h2 id="org-terms" className="font-semibold text-xl">
				{t("terms.title")}
			</h2>
			<p className="rounded-xl border border-dashed p-3 text-muted-foreground text-sm">
				{t("terms.draftNotice")}
			</p>
			<p className="text-sm">{t("terms.intro")}</p>
			<ol className="grid list-decimal gap-2 pl-5 text-sm">
				{clauses.map((clause) => (
					<li key={clause}>{t(`terms.clauses.${clause}`)}</li>
				))}
			</ol>
			{terms.data?.accepted ? (
				<p className="text-sm">
					<Badge variant="success">{t("terms.accepted")}</Badge>{" "}
					{t("terms.acceptedBy", {
						name: terms.data.acceptedByName ?? "—",
						date: terms.data.acceptedAt
							? format.dateTime(new Date(terms.data.acceptedAt), {
									dateStyle: "medium",
								})
							: "—",
					})}
				</p>
			) : org.myRole === "owner" ? (
				<Button
					className="w-fit"
					disabled={!terms.data || accept.isPending}
					onClick={() =>
						terms.data &&
						accept.mutate({
							organizationId: org.id,
							version: terms.data.version,
						})
					}
				>
					{t("terms.accept")}
				</Button>
			) : (
				<p className="text-muted-foreground text-sm">{t("terms.ownerOnly")}</p>
			)}
		</section>
	);
}

function HackathonsTab({ org }: { org: MyOrganization }) {
	const t = useTranslations("organizations.manage");
	const queryClient = useQueryClient();
	const terms = useQuery(
		orpc.organizations.hackathons.terms.get.queryOptions({
			input: { organizationId: org.id },
		}),
	);
	const list = useQuery(
		orpc.organizations.hackathons.list.queryOptions({
			input: { organizationId: org.id },
		}),
	);
	const refresh = () => {
		void queryClient.invalidateQueries({
			queryKey: orpc.organizations.hackathons.key(),
		});
		void queryClient.invalidateQueries({ queryKey: orpc.hackathons.key() });
	};
	const advance = useMutation(
		orpc.organizations.hackathons.advance.mutationOptions({
			onSuccess: refresh,
			onError: (error) => failure(t, error),
		}),
	);

	return (
		<section className="grid gap-3" aria-labelledby="org-hackathons">
			<div className="flex items-center justify-between gap-2">
				<h2 id="org-hackathons" className="font-semibold text-xl">
					{t("tabs.hackathons")}
				</h2>
				<CreateHackathon
					scope="organization"
					organizations={[{ slug: org.slug, name: org.name }]}
					onCreated={refresh}
				/>
			</div>
			<p className="text-muted-foreground text-sm">{t("hackathonsHint")}</p>
			{list.data?.items.length === 0 && (
				<p className="text-muted-foreground">{t("noHackathons")}</p>
			)}
			<ul className="grid gap-2">
				{list.data?.items.map((item) => {
					const next =
						item.status === "archived" ? null : NEXT_ACTION[item.status];
					return (
						<li
							key={item.slug}
							className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
						>
							<span className="flex items-center gap-2">
								<span className="font-medium">{item.name}</span>
								<Badge variant="outline">{t(`status.${item.status}`)}</Badge>
							</span>
							{next && (
								<Button
									size="sm"
									variant="outline"
									disabled={
										advance.isPending ||
										(item.status === "draft" && !terms.data?.accepted)
									}
									title={
										item.status === "draft" && !terms.data?.accepted
											? t("terms.needed")
											: undefined
									}
									onClick={() =>
										advance.mutate({
											slug: item.slug,
											expectedVersion: item.version,
										})
									}
								>
									{t(`action.${next}`)}
								</Button>
							)}
						</li>
					);
				})}
			</ul>
		</section>
	);
}

function MembersTab({ org, selfId }: { org: MyOrganization; selfId: string }) {
	const t = useTranslations("organizations.manage");
	const queryClient = useQueryClient();
	const [memberText, setMemberText] = useState("");
	const team = useQuery(
		orpc.organizations.team.get.queryOptions({
			input: { organizationId: org.id },
		}),
	);
	const refresh = () => {
		void queryClient.invalidateQueries({
			queryKey: orpc.organizations.team.key(),
		});
		void queryClient.invalidateQueries({
			queryKey: orpc.organizations.mine.key(),
		});
	};
	const options = {
		onSuccess: refresh,
		onError: (e: unknown) => failure(t, e),
	};
	const invite = useMutation(
		orpc.organizations.team.invite.mutationOptions({
			...options,
			onSuccess: () => {
				setMemberText("");
				toast.success(t("invited"));
				refresh();
			},
		}),
	);
	const cancel = useMutation(
		orpc.organizations.team.cancel.mutationOptions(options),
	);
	const remove = useMutation(
		orpc.organizations.team.remove.mutationOptions(options),
	);
	const transfer = useMutation(
		orpc.organizations.team.transfer.mutationOptions({
			...options,
			onSuccess: () => {
				toast.success(t("transferSent"));
				refresh();
			},
		}),
	);
	const isOwner = org.myRole === "owner";
	const memberId = memberIdFrom(memberText);

	return (
		<section className="grid gap-4" aria-labelledby="org-members">
			<h2 id="org-members" className="font-semibold text-xl">
				{t("tabs.members")}
			</h2>
			<p className="text-muted-foreground text-sm">{t("rolesHint")}</p>
			<ul className="grid gap-2">
				{team.data?.members.map((member) => (
					<li
						key={member.memberId}
						className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
					>
						<span className="flex items-center gap-2">
							<span className="font-medium">{member.name}</span>
							<Badge variant="secondary">{t(`role.${member.role}`)}</Badge>
						</span>
						<span className="flex gap-2">
							{isOwner && member.role === "editor" && (
								<Button
									size="sm"
									variant="outline"
									disabled={transfer.isPending}
									onClick={() =>
										transfer.mutate({
											organizationId: org.id,
											memberId: member.memberId,
										})
									}
								>
									{t("transfer")}
								</Button>
							)}
							{member.role === "editor" &&
								(isOwner || member.memberId === selfId) && (
									<Button
										size="sm"
										variant="outline"
										disabled={remove.isPending}
										onClick={() =>
											remove.mutate({
												organizationId: org.id,
												memberId: member.memberId,
											})
										}
									>
										{member.memberId === selfId ? t("leave") : t("remove")}
									</Button>
								)}
						</span>
					</li>
				))}
			</ul>

			{(team.data?.invitations.length ?? 0) > 0 && (
				<div className="grid gap-2">
					<h3 className="font-medium">{t("pending")}</h3>
					<ul className="grid gap-2">
						{team.data?.invitations.map((invitation) => (
							<li
								key={invitation.id}
								className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed p-3"
							>
								<span>
									{invitation.inviteeName}{" "}
									<span className="text-muted-foreground text-sm">
										({t(`invitationRole.${invitation.role}`)})
									</span>
								</span>
								{isOwner && (
									<Button
										size="sm"
										variant="ghost"
										disabled={cancel.isPending}
										onClick={() =>
											cancel.mutate({ invitationId: invitation.id })
										}
									>
										{t("cancel")}
									</Button>
								)}
							</li>
						))}
					</ul>
				</div>
			)}

			{isOwner && (
				<form
					className="grid gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						if (memberId) {
							invite.mutate({ organizationId: org.id, memberId });
						}
					}}
				>
					<label htmlFor="invite-member" className="font-medium">
						{t("inviteLabel")}
					</label>
					<div className="flex gap-2">
						<Input
							id="invite-member"
							value={memberText}
							onChange={(e) => setMemberText(e.target.value)}
							placeholder={t("invitePlaceholder")}
						/>
						<Button type="submit" disabled={!memberId || invite.isPending}>
							{t("invite")}
						</Button>
					</div>
					<p className="text-muted-foreground text-xs">{t("inviteHint")}</p>
				</form>
			)}
		</section>
	);
}

/** The invitations waiting for the signed-in Member, with accept and decline (#326). */
export function OrganizationInvitations() {
	const t = useTranslations("organizations.manage");
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();
	const invitations = useQuery({
		...orpc.organizations.invitations.mine.queryOptions({ input: {} }),
		enabled: Boolean(session),
	});
	const done = () => {
		void queryClient.invalidateQueries({
			queryKey: orpc.organizations.invitations.key(),
		});
		void queryClient.invalidateQueries({
			queryKey: orpc.organizations.mine.key(),
		});
	};
	const accept = useMutation(
		orpc.organizations.invitations.accept.mutationOptions({
			onSuccess: () => {
				toast.success(t("accepted"));
				done();
			},
			onError: (error) => {
				failure(t, error);
				done();
			},
		}),
	);
	const decline = useMutation(
		orpc.organizations.invitations.decline.mutationOptions({
			onSuccess: done,
			onError: (error) => failure(t, error),
		}),
	);
	const items: OrganizationInvitation[] = invitations.data?.items ?? [];
	if (items.length === 0) {
		return null;
	}

	return (
		<section aria-labelledby="invitations" className="grid gap-3">
			<h2 id="invitations" className="font-semibold text-xl">
				{t("invitations")}
			</h2>
			<ul className="grid gap-2">
				{items.map((invitation) => (
					<li
						key={invitation.id}
						className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
					>
						<span>
							{t(`invitationText.${invitation.role}`, {
								organization: invitation.organizationName,
								by: invitation.invitedByName ?? "",
							})}
						</span>
						<span className="flex gap-2">
							<Button
								size="sm"
								disabled={accept.isPending}
								onClick={() => accept.mutate({ invitationId: invitation.id })}
							>
								{t("accept")}
							</Button>
							<Button
								size="sm"
								variant="outline"
								disabled={decline.isPending}
								onClick={() => decline.mutate({ invitationId: invitation.id })}
							>
								{t("decline")}
							</Button>
						</span>
					</li>
				))}
			</ul>
		</section>
	);
}
