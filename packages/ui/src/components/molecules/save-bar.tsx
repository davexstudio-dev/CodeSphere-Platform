"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { SuccessCheck } from "@codesphere/ui/components/atoms/success-check";
import { cn } from "@codesphere/ui/lib/utils";
import { useEffect, useRef, useState } from "react";

/** How long the success check stays after a save went through. */
const SAVED_MS = 2500;

type SaveBarProps = {
	/** Something differs from what was loaded: the only state in which saving is possible. */
	dirty: boolean;
	saving?: boolean;
	onSave: () => void;
	onDiscard: () => void;
	dirtyText?: string;
	cleanText?: string;
	saveLabel?: string;
	discardLabel?: string;
	className?: string;
};

/** The sticky save bar of an edited record (#117): « Enregistrer » stays off until a change. */
function SaveBar({
	dirty,
	saving,
	onSave,
	onDiscard,
	dirtyText = "Modifications non enregistrées",
	cleanText = "Aucune modification",
	saveLabel = "Enregistrer",
	discardLabel = "Annuler",
	className,
}: SaveBarProps) {
	// A save went through when `saving` ends with nothing left to save: the check marks it.
	const [saved, setSaved] = useState(false);
	const wasSaving = useRef(false);
	useEffect(() => {
		if (wasSaving.current && !saving && !dirty) {
			setSaved(true);
			const timer = setTimeout(() => setSaved(false), SAVED_MS);
			wasSaving.current = !!saving;
			return () => clearTimeout(timer);
		}
		wasSaving.current = !!saving;
	}, [saving, dirty]);

	return (
		<div
			data-slot="save-bar"
			data-dirty={dirty ? "" : undefined}
			className={cn(
				"sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-md",
				dirty && "border-primary/40",
				className,
			)}
		>
			<span
				aria-live="polite"
				className={cn(
					"text-sm",
					dirty ? "font-medium" : "text-muted-foreground",
				)}
			>
				{dirty ? dirtyText : cleanText}
				<SuccessCheck
					show={saved && !dirty}
					className="ml-1.5 size-4 align-middle text-success"
				/>
			</span>
			<span className="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={onDiscard}
					disabled={!dirty || saving}
				>
					{discardLabel}
				</Button>
				<Button size="sm" onClick={onSave} disabled={!dirty || saving}>
					{saveLabel}
				</Button>
			</span>
		</div>
	);
}

export { SaveBar, type SaveBarProps };
