"use client";

import { useDataSaver } from "@codesphere/ui/lib/data-saver";
import { cn } from "@codesphere/ui/lib/utils";
import { Dithering } from "@paper-design/shaders-react";
import { useEffect, useState } from "react";

type Dithering404Props = Omit<React.ComponentProps<"section">, "title"> & {
	code?: string;
	/** Small label above the code, e.g. « Erreur 404 ». */
	eyebrow: string;
	title: string;
	description: string;
	/** The links out, e.g. two `Button`s. */
	actions?: React.ReactNode;
};

/** A design token as `rgb(…)`: the shader cannot read a CSS variable, nor parse oklch. */
function tokenColor(name: string) {
	const value = getComputedStyle(document.documentElement).getPropertyValue(
		name,
	);
	const context = document.createElement("canvas").getContext("2d");
	if (!context || !value) {
		return null;
	}
	context.fillStyle = value;
	context.fillRect(0, 0, 1, 1);
	const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
	return `rgb(${r}, ${g}, ${b})`;
}

// Adapted from the `dithering-404` block of the shaderscn registry (`@shaderscn/dithering-404`, on
// Paper Shaders): its fixed black and lime become the CADEV surface and the gold, its texts come
// from the caller. Data saver mode keeps the plain surface; reduced motion keeps a still image.
/** A full-screen « page not found » with a dithered swirl behind the message (always dark). */
function Dithering404({
	code = "404",
	eyebrow,
	title,
	description,
	actions,
	className,
	...props
}: Dithering404Props) {
	const dataSaver = useDataSaver();
	const [shader, setShader] = useState<{
		back: string;
		front: string;
		still: boolean;
	} | null>(null);
	useEffect(() => {
		const back = tokenColor("--cadev");
		const front = tokenColor("--gold");
		if (back && front) {
			setShader({
				back,
				front,
				still: matchMedia("(prefers-reduced-motion: reduce)").matches,
			});
		}
	}, []);

	return (
		<section
			data-slot="dithering-404"
			className={cn(
				"relative isolate flex min-h-svh w-full flex-col items-center justify-center overflow-hidden bg-cadev px-6 py-24 text-center text-cadev-foreground",
				className,
			)}
			{...props}
		>
			{shader && !dataSaver && (
				<Dithering
					aria-hidden
					className="absolute inset-0 -z-10 size-full"
					colorBack={shader.back}
					colorFront={shader.front}
					shape="swirl"
					type="8x8"
					size={3}
					scale={1.2}
					speed={shader.still ? 0 : 0.4}
				/>
			)}
			{/* Darkens the middle of the swirl so the message stays readable. */}
			<div
				aria-hidden
				className="absolute inset-0 -z-10"
				style={{
					background:
						"radial-gradient(closest-side, var(--cadev) 35%, transparent)",
				}}
			/>
			<div className="flex max-w-xl flex-col items-center gap-5">
				<p className="font-mono font-semibold text-2xs text-gold uppercase tracking-widest">
					{eyebrow}
				</p>
				<p
					aria-hidden
					className="font-bold text-[clamp(6rem,20vw,12rem)] leading-none tracking-tighter"
				>
					{code}
				</p>
				<h1 className="text-balance font-bold text-3xl tracking-tight sm:text-4xl">
					{title}
				</h1>
				<p className="max-w-md text-pretty text-cadev-muted">{description}</p>
				{actions && (
					<div className="flex flex-wrap items-center justify-center gap-3">
						{actions}
					</div>
				)}
			</div>
		</section>
	);
}

export { Dithering404, type Dithering404Props };
