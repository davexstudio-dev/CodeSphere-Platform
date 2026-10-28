"use client";

import { ScrollArea } from "@codesphere/ui/components/molecules/scroll-area";
import { cn } from "@codesphere/ui/lib/utils";
import { useEffect, useRef, useState } from "react";

export type QuestionStep = { id: string; label: string };

/** A section is the current one once its top has passed this line, under the sticky bars. */
const READING_LINE = 160;

/**
 * The sections of a Question page as steps to jump to (question, solution, answers, reply). The
 * step being read is marked `aria-current="location"`: the last section whose top has passed the
 * reading line, or the last step once the page is scrolled to its end (a short last section can
 * never reach the line). A click keeps its step marked until the reader scrolls on their own.
 */
export function QuestionSteps({
	steps,
	label,
	className,
}: {
	steps: readonly QuestionStep[];
	label: string;
	className?: string;
}) {
	const [active, setActive] = useState(steps[0]?.id);
	const pinned = useRef(false);
	const ids = steps.map((step) => step.id).join("|");

	useEffect(() => {
		const ordered = ids.split("|");
		const update = () => {
			if (pinned.current) {
				return;
			}
			const atEnd =
				window.innerHeight + window.scrollY >=
				document.documentElement.scrollHeight - 2;
			let current = ordered[0];
			for (const id of ordered) {
				const node = document.getElementById(id);
				if (node && node.getBoundingClientRect().top <= READING_LINE) {
					current = id;
				}
			}
			setActive(atEnd ? ordered[ordered.length - 1] : current);
		};
		const unpin = () => {
			pinned.current = false;
		};
		update();
		window.addEventListener("scroll", update, { passive: true });
		window.addEventListener("resize", update);
		// The reader takes over the scroll again.
		window.addEventListener("wheel", unpin, { passive: true });
		window.addEventListener("touchstart", unpin, { passive: true });
		window.addEventListener("keydown", unpin);
		return () => {
			window.removeEventListener("scroll", update);
			window.removeEventListener("resize", update);
			window.removeEventListener("wheel", unpin);
			window.removeEventListener("touchstart", unpin);
			window.removeEventListener("keydown", unpin);
		};
	}, [ids]);

	return (
		<nav
			aria-label={label}
			className={cn(
				"sticky top-16 z-10 -mx-1 bg-background/90 px-1 py-2 backdrop-blur",
				className,
			)}
		>
			<ScrollArea orientation="horizontal">
				<ol className="flex w-max min-w-full items-center gap-1.5">
					{steps.map((step, index) => (
						<li key={step.id}>
							<a
								href={`#${step.id}`}
								aria-current={active === step.id ? "location" : undefined}
								onClick={(event) => {
									const target = document.getElementById(step.id);
									if (target) {
										event.preventDefault();
										pinned.current = true;
										target.scrollIntoView({
											behavior: "smooth",
											block: "start",
										});
										setActive(step.id);
									}
								}}
								className={cn(
									"inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 font-medium text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
									active === step.id
										? "border-primary bg-primary text-primary-foreground"
										: "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
								)}
							>
								<span aria-hidden className="font-mono text-xs opacity-70">
									{index + 1}
								</span>
								{step.label}
							</a>
						</li>
					))}
				</ol>
			</ScrollArea>
		</nav>
	);
}
