"use client";

import { cn } from "@codesphere/ui/lib/utils";
import { useEffect, useState } from "react";

/** The block whose `RevealLine`s rise in with a staggered blur once it has mounted. */
function TextsReveal({ className, ...props }: React.ComponentProps<"div">) {
	const [shown, setShown] = useState(false);
	useEffect(() => {
		// One frame after mount, so the lines are painted hidden first and the transition runs.
		const frame = requestAnimationFrame(() => setShown(true));
		return () => cancelAnimationFrame(frame);
	}, []);
	return (
		<div
			data-slot="texts-reveal"
			className={cn("t-stagger", shown && "is-shown", className)}
			{...props}
		/>
	);
}

/** One line of a `TextsReveal`; the headline is line 1, its supporting text line 2. */
function RevealLine({
	line,
	as: Tag = "span",
	className,
	...props
}: React.HTMLAttributes<HTMLElement> & {
	line: 1 | 2;
	as?: "span" | "h1" | "h2" | "h3" | "p";
}) {
	return (
		<Tag
			className={cn("t-stagger-line", `t-stagger-line--${line}`, className)}
			{...props}
		/>
	);
}

export { RevealLine, TextsReveal };
