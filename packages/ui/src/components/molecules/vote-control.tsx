"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { cn } from "@codesphere/ui/lib/utils";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Vote = "up" | "down";

type VoteControlProps = Omit<React.ComponentProps<"fieldset">, "onChange"> & {
	/** Net score of the content. */
	score: number;
	/** The current member's vote, `null` when they have not voted. */
	value: Vote | null;
	/** Called with the new vote, or `null` when the member retracts it. */
	onValueChange: (value: Vote | null) => void;
	/** Agents and the author cannot vote on this content. */
	disabled?: boolean;
	orientation?: "horizontal" | "vertical";
	/** Texts in the interface language; French by default. */
	labels?: Partial<VoteControlLabels>;
};

type VoteControlLabels = { group: string; up: string; down: string };

const FRENCH: VoteControlLabels = {
	group: "Vote",
	up: "Voter pour",
	down: "Voter contre",
};

function VoteControl({
	score,
	value,
	onValueChange,
	disabled,
	orientation = "horizontal",
	labels,
	className,
	...props
}: VoteControlProps) {
	const l = { ...FRENCH, ...labels };
	// The score pops when it changes (not on first paint): the inner span restarts the animation
	// while the live region itself stays put, so the change is still announced.
	const previous = useRef(score);
	const [bumps, setBumps] = useState(0);
	useEffect(() => {
		if (previous.current !== score) {
			previous.current = score;
			setBumps((count) => count + 1);
		}
	}, [score]);
	const toggle = (vote: Vote) => onValueChange(value === vote ? null : vote);
	return (
		<fieldset
			aria-label={l.group}
			data-slot="vote-control"
			className={cn(
				"m-0 inline-flex min-w-0 items-center gap-1 border-0 p-0",
				orientation === "vertical" && "flex-col",
				className,
			)}
			{...props}
		>
			<Button
				type="button"
				variant={value === "up" ? "default" : "ghost"}
				size="icon-sm"
				aria-label={l.up}
				aria-pressed={value === "up"}
				disabled={disabled}
				onClick={() => toggle("up")}
			>
				<ChevronUpIcon />
			</Button>
			<span
				aria-live="polite"
				className="min-w-6 text-center font-semibold text-sm tabular-nums"
			>
				<span
					key={bumps}
					className={cn(bumps > 0 && "motion-pop inline-block")}
				>
					{score}
				</span>
			</span>
			<Button
				type="button"
				variant={value === "down" ? "default" : "ghost"}
				size="icon-sm"
				aria-label={l.down}
				aria-pressed={value === "down"}
				disabled={disabled}
				onClick={() => toggle("down")}
			>
				<ChevronDownIcon />
			</Button>
		</fieldset>
	);
}

export {
	type Vote,
	VoteControl,
	type VoteControlLabels,
	type VoteControlProps,
};
