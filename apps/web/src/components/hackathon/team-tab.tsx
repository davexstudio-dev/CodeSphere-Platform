"use client";

import type { Team } from "@codesphere/contract";
import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Textarea } from "@codesphere/ui/components/atoms/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import SsoLoginDialog from "@/components/sso-login-dialog";
import { errorCodeOf } from "@/i18n/errors";
import { authClient } from "@/lib/auth-client";
import { teamConflictReason } from "@/lib/team-errors";
import { orpc } from "@/utils/orpc";

/** « Mon équipe » (#261): create or join a Team, invite, and the Team's Submission. */
export function TeamTab({ slug }: { slug: string }) {
	const t = useTranslations("hackathon.team");
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();
	const [signingIn, setSigningIn] = useState(false);
	const team = useQuery({
		...orpc.teams.mine.queryOptions({ input: { slug } }),
		enabled: Boolean(session),
	});
	const invitations = useQuery({
		...orpc.teams.invitations.queryOptions({ input: {} }),
		enabled: Boolean(session),
	});
	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey: orpc.teams.key() });
	};
	const failed = (error: unknown) => {
		const reason = teamConflictReason(error);
		const code = errorCodeOf(error);
		toast.error(
			reason === "already_in_team"
				? t("errors.already")
				: reason === "team_full"
					? t("errors.full")
					: reason === "closed"
						? t("errors.closed")
						: code === "CONFLICT"
							? t("errors.conflict")
							: code === "NOT_FOUND"
								? t("errors.notFound")
								: t("errors.generic"),
		);
	};
	const options = { onSuccess: refresh, onError: failed };
	const create = useMutation(orpc.teams.create.mutationOptions(options));
	const respond = useMutation(orpc.teams.respond.mutationOptions(options));
	const [name, setName] = useState("");

	if (!session) {
		return (
			<section className="grid gap-3">
				<p className="text-muted-foreground">{t("signIn")}</p>
				<Button className="w-fit" onClick={() => setSigningIn(true)}>
					{t("signInButton")}
				</Button>
				<SsoLoginDialog open={signingIn} onOpenChange={setSigningIn} />
			</section>
		);
	}
	const mine = team.data;
	return (
		<section className="grid gap-6">
			{(invitations.data?.items ?? [])
				.filter((i) => i.hackathonSlug === slug)
				.map((invite) => (
					<div
						key={invite.teamId}
						className="flex flex-wrap items-center gap-3 rounded-2xl border p-4"
					>
						<span className="flex-1 text-sm">
							{t("invited", {
								team: invite.teamName,
								by: invite.invitedByName,
							})}
						</span>
						<Button
							size="sm"
							disabled={respond.isPending}
							onClick={() =>
								respond.mutate({ teamId: invite.teamId, accept: true })
							}
						>
							{t("accept")}
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={respond.isPending}
							onClick={() =>
								respond.mutate({ teamId: invite.teamId, accept: false })
							}
						>
							{t("decline")}
						</Button>
					</div>
				))}
			{team.isPending ? null : mine ? (
				<TeamView team={mine} onChange={refresh} onError={failed} />
			) : (
				<form
					className="grid max-w-md gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						create.mutate({ slug, name });
					}}
				>
					<h2 className="font-semibold text-lg">{t("createTitle")}</h2>
					<p className="text-muted-foreground text-sm">{t("createHint")}</p>
					<Input
						required
						minLength={2}
						maxLength={60}
						value={name}
						onChange={(e) => setName(e.target.value)}
						aria-label={t("teamName")}
						placeholder={t("teamName")}
					/>
					<Button type="submit" disabled={create.isPending} className="w-fit">
						{t("create")}
					</Button>
				</form>
			)}
		</section>
	);
}

function TeamView({
	team,
	onChange,
	onError,
}: {
	team: Team;
	onChange: () => void;
	onError: (error: unknown) => void;
}) {
	const t = useTranslations("hackathon.team");
	const { data: session } = authClient.useSession();
	const options = { onSuccess: onChange, onError };
	const invite = useMutation(orpc.teams.invite.mutationOptions(options));
	const remove = useMutation(orpc.teams.removeMember.mutationOptions(options));
	const leave = useMutation(orpc.teams.leave.mutationOptions(options));
	const rotate = useMutation(orpc.teams.rotateLink.mutationOptions(options));
	const disband = useMutation(orpc.teams.disband.mutationOptions(options));
	const [inviteName, setInviteName] = useState("");
	const captain = session?.user.id === team.captainId;
	const link =
		typeof window !== "undefined" && team.inviteToken
			? `${window.location.origin}/teams/join/${team.inviteToken}`
			: null;

	return (
		<div className="grid gap-6">
			<header className="grid gap-1">
				<h2 className="font-semibold text-xl">{team.name}</h2>
				<p className="text-muted-foreground text-sm">
					{t("size", { count: team.members.length, max: team.maxMembers })}
					{!team.registrationOpen && ` · ${t("registrationClosed")}`}
				</p>
			</header>
			<ul className="grid gap-2">
				{team.members.map((m) => (
					<li key={m.id} className="flex items-center gap-2 text-sm">
						<span>{m.name}</span>
						{m.isCaptain && <Badge variant="secondary">{t("captain")}</Badge>}
						{captain && !m.isCaptain && team.registrationOpen && (
							<Button
								size="sm"
								variant="ghost"
								onClick={() =>
									remove.mutate({ teamId: team.id, memberId: m.id })
								}
							>
								{t("remove")}
							</Button>
						)}
					</li>
				))}
				{team.pendingInvites.map((n) => (
					<li key={n} className="text-muted-foreground text-sm">
						{n} — {t("pending")}
					</li>
				))}
			</ul>

			{captain && team.registrationOpen && (
				<div className="grid gap-3 rounded-2xl border p-4">
					<h3 className="font-medium">{t("inviteTitle")}</h3>
					{link && (
						<div className="flex flex-wrap items-center gap-2">
							<Input
								readOnly
								value={link}
								aria-label={t("link")}
								className="min-w-0 flex-1 font-mono text-xs"
								onFocus={(e) => e.currentTarget.select()}
							/>
							<Button
								size="sm"
								variant="outline"
								onClick={() =>
									navigator.clipboard
										?.writeText(link)
										.then(() => toast.success(t("copied")))
								}
							>
								{t("copy")}
							</Button>
							<Button
								size="sm"
								variant="ghost"
								disabled={rotate.isPending}
								onClick={() => rotate.mutate({ teamId: team.id })}
							>
								{t("rotate")}
							</Button>
						</div>
					)}
					<form
						className="flex flex-wrap gap-2"
						onSubmit={(event) => {
							event.preventDefault();
							invite.mutate(
								{ teamId: team.id, name: inviteName },
								{ onSuccess: () => setInviteName("") },
							);
						}}
					>
						<Input
							value={inviteName}
							onChange={(e) => setInviteName(e.target.value)}
							aria-label={t("inviteByName")}
							placeholder={t("inviteByName")}
							className="min-w-0 flex-1"
						/>
						<Button
							type="submit"
							size="sm"
							disabled={invite.isPending || inviteName.trim().length < 2}
						>
							{t("invite")}
						</Button>
					</form>
				</div>
			)}

			<SubmissionForm team={team} onChange={onChange} onError={onError} />

			{team.registrationOpen && (
				<div className="flex flex-wrap gap-2">
					{captain ? (
						<Button
							variant="destructive"
							size="sm"
							disabled={disband.isPending}
							onClick={() =>
								window.confirm(t("confirmDisband")) &&
								disband.mutate({ teamId: team.id })
							}
						>
							{t("disband")}
						</Button>
					) : (
						<Button
							variant="outline"
							size="sm"
							disabled={leave.isPending}
							onClick={() => leave.mutate({ teamId: team.id })}
						>
							{t("leave")}
						</Button>
					)}
				</div>
			)}
		</div>
	);
}

function SubmissionForm({
	team,
	onChange,
	onError,
}: {
	team: Team;
	onChange: () => void;
	onError: (error: unknown) => void;
}) {
	const t = useTranslations("hackathon.team.submission");
	const current = team.submission;
	const [title, setTitle] = useState(current?.title ?? "");
	const [description, setDescription] = useState(current?.description ?? "");
	const [repoUrl, setRepoUrl] = useState(current?.repoUrl ?? "");
	const [demoUrl, setDemoUrl] = useState(current?.demoUrl ?? "");
	const [videoUrl, setVideoUrl] = useState(current?.videoUrl ?? "");
	const [tags, setTags] = useState((current?.tags ?? []).join(", "));
	// The saved version replaces the editor's copy: a teammate's edit shows up after a reload.
	useEffect(() => {
		if (current) {
			setTitle(current.title);
			setDescription(current.description);
			setRepoUrl(current.repoUrl);
			setDemoUrl(current.demoUrl);
			setVideoUrl(current.videoUrl ?? "");
			setTags(current.tags.join(", "));
		}
		// Only a new saved version resets the fields: a refetch must not erase what is being typed.
		// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the version on purpose
	}, [current?.version]);
	const save = useMutation(
		orpc.teams.saveSubmission.mutationOptions({
			onSuccess: () => {
				toast.success(t("saved"));
				onChange();
			},
			onError,
		}),
	);
	const frozen = !team.submissionOpen;

	return (
		<form
			className="grid gap-3"
			onSubmit={(event) => {
				event.preventDefault();
				save.mutate({
					teamId: team.id,
					title,
					description,
					repoUrl,
					demoUrl,
					videoUrl: videoUrl.trim() || null,
					tags: tags
						.split(",")
						.map((x) => x.trim())
						.filter(Boolean)
						.slice(0, 5),
					expectedVersion: current?.version,
				});
			}}
		>
			<h3 className="font-semibold text-lg">{t("title")}</h3>
			<p className="text-muted-foreground text-sm">
				{frozen ? t("frozen") : t("hint")}
			</p>
			<Input
				required
				minLength={3}
				maxLength={140}
				disabled={frozen}
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				aria-label={t("projectTitle")}
				placeholder={t("projectTitle")}
			/>
			<Textarea
				required
				minLength={20}
				maxLength={6000}
				rows={8}
				disabled={frozen}
				value={description}
				onChange={(e) => setDescription(e.target.value)}
				aria-label={t("description")}
				placeholder={t("description")}
			/>
			<Input
				required
				type="url"
				disabled={frozen}
				value={repoUrl}
				onChange={(e) => setRepoUrl(e.target.value)}
				aria-label={t("repo")}
				placeholder="https://github.com/…"
			/>
			<Input
				required
				type="url"
				disabled={frozen}
				value={demoUrl}
				onChange={(e) => setDemoUrl(e.target.value)}
				aria-label={t("demo")}
				placeholder="https://…"
			/>
			<Input
				type="url"
				disabled={frozen}
				value={videoUrl}
				onChange={(e) => setVideoUrl(e.target.value)}
				aria-label={t("video")}
				placeholder={t("video")}
			/>
			<Input
				disabled={frozen}
				value={tags}
				onChange={(e) => setTags(e.target.value)}
				aria-label={t("tags")}
				placeholder={t("tags")}
			/>
			{!frozen && (
				<Button type="submit" disabled={save.isPending} className="w-fit">
					{current ? t("update") : t("save")}
				</Button>
			)}
		</form>
	);
}
