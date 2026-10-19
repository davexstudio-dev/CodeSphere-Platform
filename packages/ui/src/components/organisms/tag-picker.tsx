"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { cn } from "@codesphere/ui/lib/utils";

type TagPickerProps = Omit<
	React.ComponentProps<"section">,
	"children" | "onSubmit"
> & {
	tags: readonly string[];
	value: readonly string[];
	onValueChange: (value: string[]) => void;
	/** Tags required to continue; the step can still be skipped (spec §3, Flux). */
	min?: number;
	onSubmit: () => void;
	onSkip: () => void;
	/** The choice is being saved: both actions wait, so a double click saves once. */
	pending?: boolean;
	/** Texts in the interface language; French by default. */
	labels?: Partial<TagPickerLabels>;
};

type TagPickerLabels = {
	title: string;
	lead: (min: number) => string;
	missing: (count: number) => string;
	ready: (count: number) => string;
	skip: string;
	submit: string;
	saving: string;
};

const FRENCH: TagPickerLabels = {
	title: "Que voulez-vous suivre ?",
	lead: (min) =>
		`Choisissez au moins ${min} tags : votre fil « Pour toi » s'appuie dessus.`,
	missing: (count) => `Encore ${count} tag${count > 1 ? "s" : ""} à choisir`,
	ready: (count) => `${count} tags sélectionnés`,
	skip: "Passer",
	submit: "Continuer",
	saving: "Enregistrement…",
};

/** Onboarding step: pick at least `min` Tags to follow, or skip the step. */
function TagPicker({
	tags,
	value,
	onValueChange,
	min = 3,
	onSubmit,
	onSkip,
	pending = false,
	labels,
	className,
	...props
}: TagPickerProps) {
	const l = { ...FRENCH, ...labels };
	const toggle = (tag: string) =>
		onValueChange(
			value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag],
		);
	const missing = Math.max(0, min - value.length);

	return (
		<section
			data-slot="tag-picker"
			className={cn(
				"motion-rise flex flex-col gap-5 rounded-xl border border-border bg-card p-6 text-card-foreground",
				className,
			)}
			{...props}
		>
			<header className="flex flex-col gap-1">
				<h2 className="font-semibold text-xl tracking-tight">{l.title}</h2>
				<p className="text-muted-foreground text-sm">{l.lead(min)}</p>
			</header>
			<ul className="flex flex-wrap gap-2">
				{tags.map((tag, index) => {
					const selected = value.includes(tag);
					return (
						<li
							key={tag}
							className="motion-rise"
							style={{ "--i": index } as React.CSSProperties}
						>
							<button
								type="button"
								aria-pressed={selected}
								onClick={() => toggle(tag)}
								className={cn(
									"rounded-full border px-3 py-1 text-sm outline-none transition-[color,background-color,border-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-95",
									selected
										? "border-primary bg-primary text-primary-foreground"
										: "border-border text-muted-foreground hover:border-primary hover:text-foreground",
								)}
							>
								# {tag}
							</button>
						</li>
					);
				})}
			</ul>
			<footer className="flex flex-wrap items-center justify-between gap-3">
				<p aria-live="polite" className="text-muted-foreground text-xs">
					{missing > 0 ? l.missing(missing) : l.ready(value.length)}
				</p>
				<div className="flex gap-2">
					<Button
						type="button"
						variant="ghost"
						onClick={onSkip}
						disabled={pending}
					>
						{l.skip}
					</Button>
					<Button
						type="button"
						disabled={missing > 0 || pending}
						aria-busy={pending}
						onClick={onSubmit}
					>
						{pending ? l.saving : l.submit}
					</Button>
				</div>
			</footer>
		</section>
	);
}

export { TagPicker, type TagPickerLabels, type TagPickerProps };
