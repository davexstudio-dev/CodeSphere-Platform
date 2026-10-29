"use client";

import { Tag } from "@codesphere/ui/components/atoms/tag";
import { cn } from "@codesphere/ui/lib/utils";
import { XIcon } from "lucide-react";
import { useState } from "react";

type TagInputProps = Omit<React.ComponentProps<"div">, "onChange"> & {
	value: readonly string[];
	onValueChange: (value: string[]) => void;
	/** Existing Tags offered while typing. */
	suggestions?: readonly string[];
	max?: number;
	placeholder?: string;
	/** Accessible name of a Tag's remove button. */
	removeLabel?: (tag: string) => string;
	/** Placeholder once `max` Tags are entered. */
	fullPlaceholder?: (max: number) => string;
	inputId?: string;
	invalid?: boolean;
};

/** Tags are lowercase, without spaces: « Mobile Money » becomes `mobile-money`. */
function normalizeTag(raw: string) {
	return raw
		.trim()
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9#+.-]/g, "")
		.slice(0, 24);
}

/** Free entry of Tags: Enter or a comma adds one, Backspace removes the last. */
function TagInput({
	value,
	onValueChange,
	suggestions = [],
	max = 5,
	placeholder = "Ajouter un tag",
	removeLabel = (tag) => `Retirer ${tag}`,
	fullPlaceholder = (limit) => `${limit} tags au maximum`,
	inputId,
	invalid,
	className,
	...props
}: TagInputProps) {
	const [draft, setDraft] = useState("");
	const full = value.length >= max;

	const add = (raw: string) => {
		const tag = normalizeTag(raw);
		if (tag && !value.includes(tag) && !full) {
			onValueChange([...value, tag]);
		}
		setDraft("");
	};

	const matches = suggestions
		.filter((s) => !value.includes(s) && s.includes(normalizeTag(draft)))
		.slice(0, 5);

	return (
		<div
			data-slot="tag-input"
			className={cn("flex flex-col gap-2", className)}
			{...props}
		>
			<div
				className={cn(
					"flex min-h-8 flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50 dark:bg-input/30",
					invalid ? "border-destructive" : "border-input",
				)}
			>
				{value.map((tag) => (
					<Tag key={tag} removable>
						{tag}
						<button
							type="button"
							aria-label={removeLabel(tag)}
							className="rounded-sm p-0.5 text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
							onClick={() => onValueChange(value.filter((t) => t !== tag))}
						>
							<XIcon className="size-3" />
						</button>
					</Tag>
				))}
				<input
					id={inputId}
					value={draft}
					disabled={full}
					placeholder={full ? fullPlaceholder(max) : placeholder}
					aria-invalid={invalid}
					className="min-w-24 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
					onChange={(event) => {
						const next = event.target.value;
						if (next.endsWith(",")) {
							add(next.slice(0, -1));
						} else {
							setDraft(next);
						}
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							add(draft);
						} else if (
							event.key === "Backspace" &&
							draft === "" &&
							value.length > 0
						) {
							onValueChange(value.slice(0, -1));
						}
					}}
				/>
			</div>
			{draft && matches.length > 0 && (
				<ul aria-label="Suggestions" className="flex flex-wrap gap-1.5">
					{matches.map((suggestion) => (
						<li key={suggestion}>
							<button
								type="button"
								className="rounded-full border border-border px-2.5 py-0.5 text-muted-foreground text-xs outline-none transition-colors hover:border-primary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
								onClick={() => add(suggestion)}
							>
								# {suggestion}
							</button>
						</li>
					))}
				</ul>
			)}
			<p className="text-muted-foreground text-xs">
				{value.length}/{max} tags
			</p>
		</div>
	);
}

export { normalizeTag, TagInput, type TagInputProps };
