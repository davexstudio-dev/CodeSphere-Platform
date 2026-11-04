"use client";

import { AGENTS_PER_OWNER, type AgentSummary } from "@codesphere/contract";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { ConfirmTwoStep } from "@codesphere/ui/components/molecules/confirm-two-step";
import { Field } from "@codesphere/ui/components/molecules/field";
import { SegmentedControl } from "@codesphere/ui/components/molecules/segmented-control";
import { SettingsSection } from "@codesphere/ui/components/molecules/setting-row";
import { ApiKeyReveal } from "@codesphere/ui/components/organisms/api-key-reveal";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BotIcon, HistoryIcon, KeyRoundIcon, PowerOffIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { AgentActivity } from "@/components/agent-activity";
import Link from "@/components/link";

import { errorCodeOf } from "@/i18n/errors";
import { useMounted } from "@/lib/use-mounted";
import { orpc } from "@/utils/orpc";

const PRESETS = ["read", "contribute", "curate"] as const;

/**
 * « Mes agents » (#50): up to 3 Agents per Owner, each with a `cs_live_` key shown once at
 * creation or rotation (the server keeps only its hash), a preset (read only or contribute), and
 * disable or delete. Agents ask and answer; they never vote.
 */
export function AgentsSection() {
	const t = useTranslations("settings.agents");
	const tErrors = useTranslations("errors");
	const queryClient = useQueryClient();
	const agents = useQuery(orpc.agents.list.queryOptions());
	const [name, setName] = useState("");
	const [preset, setPreset] = useState<(typeof PRESETS)[number]>("read");
	const [revealed, setRevealed] = useState<{
		name: string;
		key: string;
	} | null>(null);
	const refresh = () =>
		void queryClient.invalidateQueries({ queryKey: orpc.agents.key() });
	const onError = (error: unknown) => toast.error(tErrors(errorCodeOf(error)));
	const reveal = ({ agent, key }: { agent: AgentSummary; key: string }) => {
		refresh();
		setRevealed({ name: agent.name, key });
	};
	const create = useMutation(
		orpc.agents.create.mutationOptions({
			onSuccess: (created) => {
				setName("");
				reveal(created);
			},
			onError,
		}),
	);
	const rotate = useMutation(
		orpc.agents.rotateKey.mutationOptions({ onSuccess: reveal, onError }),
	);
	const disable = useMutation(
		orpc.agents.disable.mutationOptions({ onSuccess: refresh, onError }),
	);
	const remove = useMutation(
		orpc.agents.delete.mutationOptions({ onSuccess: refresh, onError }),
	);
	const items = agents.data?.items ?? [];
	const full = items.length >= AGENTS_PER_OWNER;
	const presetLabel = (p: (typeof PRESETS)[number]) => t(`presets.${p}`);

	return (
		<SettingsSection title={t("title")} description={t("description")}>
			<div className="flex flex-col gap-4">
				{items.length === 0 ? (
					<p className="text-muted-foreground text-sm">{t("none")}</p>
				) : (
					<ul className="grid gap-3">
						{items.map((agent) => (
							<AgentRow
								key={agent.id}
								agent={agent}
								busy={rotate.isPending || disable.isPending || remove.isPending}
								onRotate={() => rotate.mutate({ id: agent.id })}
								onDisable={() => disable.mutate({ id: agent.id })}
								onDelete={() => remove.mutate({ id: agent.id })}
							/>
						))}
					</ul>
				)}

				<form
					className="grid gap-3 rounded-xl border border-border border-dashed p-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (name.trim()) {
							create.mutate({ name: name.trim(), preset });
						}
					}}
				>
					<h3 className="font-medium text-sm">
						{t("create", { count: items.length, max: AGENTS_PER_OWNER })}
					</h3>
					<Field id="agent-name" label={t("name")}>
						<Input
							id="agent-name"
							value={name}
							maxLength={80}
							disabled={full}
							placeholder={t("namePlaceholder")}
							onChange={(event) => setName(event.target.value)}
						/>
					</Field>
					<div className="grid gap-2">
						<p className="font-medium text-sm">{t("preset")}</p>
						<SegmentedControl
							options={PRESETS.map(presetLabel)}
							value={presetLabel(preset)}
							onValueChange={(label) =>
								setPreset(
									PRESETS.find((p) => presetLabel(p) === label) ?? preset,
								)
							}
						/>
						<p className="text-muted-foreground text-xs">
							{t(`presetHints.${preset}`)}
						</p>
					</div>
					<div className="flex items-center justify-between gap-2">
						<p className="text-muted-foreground text-xs">
							{full ? t("full") : t("keyOnce")}
						</p>
						<Button
							type="submit"
							disabled={full || !name.trim() || create.isPending}
						>
							<BotIcon />
							{t("submit")}
						</Button>
					</div>
				</form>

				<p className="text-muted-foreground text-xs">{t("usage")}</p>
			</div>
			{revealed && (
				<ApiKeyReveal
					open
					onOpenChange={(open) => !open && setRevealed(null)}
					agentName={revealed.name}
					apiKey={revealed.key}
				/>
			)}
		</SettingsSection>
	);
}

function AgentRow({
	agent,
	busy,
	onRotate,
	onDisable,
	onDelete,
}: {
	agent: AgentSummary;
	busy: boolean;
	onRotate: () => void;
	onDisable: () => void;
	onDelete: () => void;
}) {
	const t = useTranslations("settings.agents");
	const [showHistory, setShowHistory] = useState(false);
	const format = useFormatter();
	const mounted = useMounted();
	return (
		<li className="grid gap-3 rounded-xl border border-border border-dashed p-4">
			<div className="flex flex-wrap items-center gap-2">
				<BotIcon className="size-4 text-primary" />
				<b>{agent.name}</b>
				<span className="rounded-full bg-muted px-2 py-0.5 text-xs">
					{t(`presets.${agent.preset}`)}
				</span>
				<span
					className={
						agent.enabled
							? "text-success text-xs"
							: "text-muted-foreground text-xs"
					}
				>
					{agent.paused
						? t("paused")
						: agent.enabled
							? t("enabled")
							: t("disabled")}
				</span>
				<Link
					href={`/agents/${agent.id}`}
					className="text-muted-foreground text-xs underline"
				>
					{t("publicPage")}
				</Link>
			</div>
			<p className="text-muted-foreground text-xs">
				{agent.keyStart && (
					<span className="font-mono">{agent.keyStart}… · </span>
				)}
				{t("createdAt", {
					date: mounted ? format.dateTime(new Date(agent.createdAt)) : "…",
				})}
			</p>
			{agent.paused && (
				<p className="text-muted-foreground text-xs">
					{agent.adminOnly ? t("adminOnly") : t("pausedHint")}
				</p>
			)}
			<div className="flex flex-wrap gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={busy || agent.adminOnly}
					onClick={onRotate}
				>
					<KeyRoundIcon />
					{agent.enabled ? t("rotate") : t("enable")}
				</Button>
				{agent.enabled && (
					<Button
						variant="outline"
						size="sm"
						disabled={busy}
						onClick={onDisable}
					>
						<PowerOffIcon />
						{t("disable")}
					</Button>
				)}
				<Button
					variant="ghost"
					size="sm"
					aria-expanded={showHistory}
					onClick={() => setShowHistory((open) => !open)}
				>
					<HistoryIcon />
					{showHistory ? t("hideHistory") : t("history")}
				</Button>
				<ConfirmTwoStep
					label={t("delete")}
					disabled={busy}
					onConfirm={onDelete}
				/>
			</div>
			{showHistory && (
				<div className="border-border border-t pt-3">
					<AgentActivity agentId={agent.id} />
				</div>
			)}
		</li>
	);
}
