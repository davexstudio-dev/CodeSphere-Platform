"use client";

import { AgentBadge } from "@codesphere/ui/components/atoms/agent-badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { StatusBadge } from "@codesphere/ui/components/atoms/status-badge";
import {
	type Vote,
	VoteControl,
	type VoteControlLabels,
} from "@codesphere/ui/components/molecules/vote-control";
import { cn } from "@codesphere/ui/lib/utils";
import { CheckIcon, CircleCheckIcon, CopyIcon, Share2Icon } from "lucide-react";
import { useId, useState } from "react";

type AnswerCardProps = Omit<React.ComponentProps<"article">, "children"> & {
	author: string;
	/** Owner of the agent that wrote the answer, when the author is an agent. */
	agentOf?: string;
	/** The author's Reputation, already worded in the interface language (absent for an agent). */
	reputation?: string;
	ago: string;
	score: number;
	vote: Vote | null;
	onVoteChange: (vote: Vote | null) => void;
	/** Agents and the author cannot vote on this answer. */
	voteDisabled?: boolean;
	accepted?: boolean;
	/** Shown to the question's author only. */
	onAccept?: () => void;
	/** Provided when the answer contains a code block. */
	onCopyCode?: () => void;
	onShare?: () => void;
	/** Fold the body until the member expands it, for long answers. */
	long?: boolean;
	/** The answer body, already rendered and sanitized by the server. */
	children: React.ReactNode;
	/** Texts in the interface language; French by default. */
	labels?: Partial<AnswerCardLabels>;
};

type AnswerCardLabels = {
	accepted: string;
	accept: string;
	copyCode: string;
	copied: string;
	share: string;
	expand: string;
	collapse: string;
	vote?: Partial<VoteControlLabels>;
};

const FRENCH: AnswerCardLabels = {
	accepted: "Acceptée",
	accept: "Accepter",
	copyCode: "Copier le code",
	copied: "Copié",
	share: "Partager",
	expand: "Voir la suite",
	collapse: "Réduire",
};

function AnswerCard({
	author,
	agentOf,
	reputation,
	ago,
	score,
	vote,
	onVoteChange,
	voteDisabled,
	accepted = false,
	onAccept,
	onCopyCode,
	onShare,
	long = false,
	children,
	labels,
	className,
	...props
}: AnswerCardProps) {
	const l = { ...FRENCH, ...labels };
	const bodyId = useId();
	const [expanded, setExpanded] = useState(false);
	const [copied, setCopied] = useState(false);
	const folded = long && !expanded;

	const copy = () => {
		onCopyCode?.();
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<article
			data-slot="answer-card"
			data-status={accepted ? "accepted" : agentOf ? "agent" : "default"}
			className={cn(
				"flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground",
				accepted && "border-success border-l-4",
				!accepted && agentOf && "border-primary border-dashed",
				!accepted && !agentOf && "border-border",
				className,
			)}
			{...props}
		>
			<header className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
				{agentOf ? (
					<AgentBadge owner={agentOf} />
				) : (
					<b className="text-foreground">{author}</b>
				)}
				{reputation && <span>· {reputation}</span>}
				<span>· {ago}</span>
				{accepted && (
					<StatusBadge status="accepted" className="ml-auto">
						<CircleCheckIcon className="size-3" /> {l.accepted}
					</StatusBadge>
				)}
			</header>

			<div
				id={bodyId}
				className={cn(
					"relative text-sm leading-relaxed",
					folded && "max-h-40 overflow-hidden",
				)}
			>
				{children}
				{folded && (
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent"
					/>
				)}
			</div>
			{long && (
				<Button
					type="button"
					variant="link"
					size="sm"
					className="w-fit px-0"
					aria-expanded={expanded}
					aria-controls={bodyId}
					onClick={() => setExpanded((value) => !value)}
				>
					{expanded ? l.collapse : l.expand}
				</Button>
			)}

			<footer className="flex flex-wrap items-center gap-2 border-border border-t pt-3">
				<VoteControl
					score={score}
					value={vote}
					onValueChange={onVoteChange}
					disabled={voteDisabled}
					labels={l.vote}
				/>
				<div className="ml-auto flex flex-wrap items-center gap-1">
					{onCopyCode && (
						<Button type="button" variant="ghost" size="sm" onClick={copy}>
							{copied ? <CheckIcon /> : <CopyIcon />}
							{copied ? l.copied : l.copyCode}
						</Button>
					)}
					{onAccept && !accepted && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onAccept}
						>
							<CircleCheckIcon /> {l.accept}
						</Button>
					)}
					{onShare && (
						<Button type="button" variant="ghost" size="sm" onClick={onShare}>
							<Share2Icon /> {l.share}
						</Button>
					)}
				</div>
			</footer>
		</article>
	);
}

export { AnswerCard, type AnswerCardLabels, type AnswerCardProps };
