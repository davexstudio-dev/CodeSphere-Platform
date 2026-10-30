"use client";

import { ConfirmTwoStep } from "@codesphere/ui/components/molecules/confirm-two-step";
import { ReasonDialog } from "@codesphere/ui/components/molecules/reason-dialog";
import { useTranslations } from "next-intl";
import { useState } from "react";

type Decision = {
	title: string;
	description: string;
	confirmLabel: string;
	reasonLabel: string;
	onSubmit: (reason: string) => void;
};

/** An admin decision that needs a reason (#324): `ask` opens the dialog, `dialog` is to be rendered. */
export function useReasonDecision() {
	const tc = useTranslations("admin.common");
	const [decision, setDecision] = useState<Decision | null>(null);
	const dialog = (
		<ReasonDialog
			open={decision !== null}
			onOpenChange={(open) => {
				if (!open) {
					setDecision(null);
				}
			}}
			title={decision?.title ?? ""}
			description={decision?.description ?? ""}
			confirmLabel={decision?.confirmLabel ?? ""}
			reasonLabel={decision?.reasonLabel}
			cancelLabel={tc("cancel")}
			countdownLabel={(seconds) => tc("confirm", { seconds })}
			onSubmit={(reason) => {
				decision?.onSubmit(reason);
				setDecision(null);
			}}
		/>
	);
	return { ask: setDecision, dialog };
}

/** A destructive action without a reason: its consequence shows once it is armed (#324). */
export function ConfirmWithNote({
	label,
	note,
	onConfirm,
}: {
	label: string;
	note: string;
	onConfirm: () => void;
}) {
	const tc = useTranslations("admin.common");
	const [armed, setArmed] = useState(false);
	return (
		<span className="grid gap-1">
			<ConfirmTwoStep
				label={label}
				confirmLabel={(seconds) => tc("confirm", { seconds })}
				cancelLabel={tc("cancel")}
				onConfirm={onConfirm}
				onArmedChange={setArmed}
			/>
			{armed && (
				<span role="status" className="text-muted-foreground text-xs">
					{note}
				</span>
			)}
		</span>
	);
}
