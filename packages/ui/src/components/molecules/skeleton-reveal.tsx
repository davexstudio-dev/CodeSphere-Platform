"use client";

import { cn } from "@codesphere/ui/lib/utils";

type SkeletonRevealProps = Omit<React.ComponentProps<"div">, "children"> & {
	/** The data has arrived: the skeleton dissolves into the content. */
	ready: boolean;
	/** Shown while waiting; its children pulse once. */
	skeleton: React.ReactNode;
	/** Rendered only once `ready`, so it never has to cope with missing data. */
	children: React.ReactNode;
};

/** Skeleton loader and reveal (transitions.dev 14): the placeholder cross-fades into the content. */
function SkeletonReveal({
	ready,
	skeleton,
	children,
	className,
	...props
}: SkeletonRevealProps) {
	return (
		<div
			data-slot="skeleton-reveal"
			className={cn("t-skel", ready && "is-revealed", className)}
			{...props}
		>
			<div
				className="t-skel-skeleton is-pulsing"
				aria-hidden={ready || undefined}
			>
				{skeleton}
			</div>
			<div className="t-skel-content">{ready ? children : null}</div>
		</div>
	);
}

export { SkeletonReveal, type SkeletonRevealProps };
