"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { ConfirmTwoStep } from "@codesphere/ui/components/molecules/confirm-two-step";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@codesphere/ui/components/molecules/dialog";
import {
	isReasonValid,
	ReasonField,
} from "@codesphere/ui/components/molecules/reason-field";
import { useId, useState } from "react";

type ReasonDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	/** What the action will do, to which record: « Vous allez suspendre ce membre : … ». */
	description: React.ReactNode;
	/** The action: « Suspendre », « Rejeter », « Confirmer ». */
	confirmLabel: string;
	/**
	 * `reject` is destructive: it asks for a reason, then for the two-step confirmation.
	 * `confirm` only asks for the reason (when `reasonRequired`) and a plain click.
	 */
	tone?: "confirm" | "reject";
	/** The reason is mandatory by default (3 to 280 characters, like the API). */
	reasonRequired?: boolean;
	reasonLabel?: string;
	cancelLabel?: string;
	/** Armed button text of a rejection, given the seconds left. */
	countdownLabel?: (seconds: number) => string;
	/** Called once, with the trimmed reason (« » when the reason is optional and left empty). */
	onSubmit: (reason: string) => void;
	/** The API's refusal, shown under the reason. */
	error?: string;
};

/**
 * The modal of an admin decision with a reason (#131 follow-up): confirm or reject a record.
 * Nothing runs until the reason is valid; a rejection also needs the second step.
 */
function ReasonDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel,
	tone = "reject",
	reasonRequired = true,
	reasonLabel,
	cancelLabel = "Annuler",
	countdownLabel,
	onSubmit,
	error,
}: ReasonDialogProps) {
	const [reason, setReason] = useState("");
	// The armed confirmation brings its own « Annuler »: show only one.
	const [armed, setArmed] = useState(false);
	const fieldId = useId();
	const valid = reasonRequired
		? isReasonValid(reason)
		: reason.trim() === "" || isReasonValid(reason);

	const close = (next: boolean) => {
		if (!next) {
			setReason("");
			setArmed(false);
		}
		onOpenChange(next);
	};
	const submit = () => {
		onSubmit(reason.trim());
		setReason("");
		setArmed(false);
	};

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<ReasonField
					id={fieldId}
					value={reason}
					onValueChange={setReason}
					label={
						reasonLabel ??
						(reasonRequired ? "Raison (obligatoire)" : "Raison (facultative)")
					}
					required={reasonRequired}
					error={error}
				/>
				<DialogFooter>
					{!(tone === "reject" && armed) && (
						<Button variant="outline" onClick={() => close(false)}>
							{cancelLabel}
						</Button>
					)}
					{tone === "reject" ? (
						<ConfirmTwoStep
							label={confirmLabel}
							{...(countdownLabel ? { confirmLabel: countdownLabel } : {})}
							disabled={!valid}
							onConfirm={submit}
							onArmedChange={setArmed}
							cancelLabel={cancelLabel}
						/>
					) : (
						<Button disabled={!valid} onClick={submit}>
							{confirmLabel}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export { ReasonDialog, type ReasonDialogProps };
