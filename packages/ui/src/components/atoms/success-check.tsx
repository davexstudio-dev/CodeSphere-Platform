"use client";

import { cn } from "@codesphere/ui/lib/utils";
import { useEffect, useState } from "react";

/** Success check (transitions.dev 10): the tick fades, turns and draws in when `show` is set. */
function SuccessCheck({
	show,
	className,
	...props
}: Omit<React.ComponentProps<"span">, "children"> & { show: boolean }) {
	const [state, setState] = useState<"in" | "out">("out");
	useEffect(() => {
		// Reset first so showing it again replays the animation from the start.
		setState("out");
		if (!show) {
			return;
		}
		const frame = requestAnimationFrame(() => setState("in"));
		return () => cancelAnimationFrame(frame);
	}, [show]);
	return (
		<span
			data-slot="success-check"
			data-state={state}
			aria-hidden="true"
			className={cn("t-success-check", className)}
			{...props}
		>
			<svg
				viewBox="0 0 48 48"
				fill="none"
				aria-hidden="true"
				className="size-full"
			>
				<path
					d="M12 24l8 8 16-16"
					stroke="currentColor"
					strokeWidth="5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		</span>
	);
}

export { SuccessCheck };
