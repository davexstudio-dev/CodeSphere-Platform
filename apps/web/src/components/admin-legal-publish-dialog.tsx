"use client";

import { bearsConsent, isMemberConsentDocument } from "@codesphere/contract";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Checkbox } from "@codesphere/ui/components/atoms/checkbox";
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
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import type { Selection } from "@/components/admin-legal-shared";

export function PublishDialog({
	open,
	onOpenChange,
	selection,
	version,
	pending,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selection: Selection;
	version: number;
	pending: boolean;
	onSubmit: (reason: string, important: boolean) => void;
}) {
	const t = useTranslations("admin.legal");
	const tc = useTranslations("admin.common");
	const [reason, setReason] = useState("");
	const [important, setImportant] = useState(false);
	const reasonId = useId();
	const importantId = useId();
	const { document, language } = selection;
	const consent = bearsConsent(document);
	const forMembers = isMemberConsentDocument(document);
	const close = (next: boolean) => {
		if (!next) {
			setReason("");
			setImportant(false);
		}
		onOpenChange(next);
	};

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{t("publishDialog.title", {
							document: t(`documents.${document}`),
							language: t(`languages.${language}`),
						})}
					</DialogTitle>
					<DialogDescription>
						{t("publishDialog.description", { version })}
					</DialogDescription>
				</DialogHeader>
				<ReasonField
					id={reasonId}
					value={reason}
					onValueChange={setReason}
					label={t("publishDialog.reason")}
				/>
				{consent && (
					<div className="grid gap-1.5">
						<div className="flex items-center gap-2">
							<Checkbox
								id={importantId}
								checked={important}
								onCheckedChange={(checked) => setImportant(checked === true)}
							/>
							<label htmlFor={importantId} className="font-medium text-sm">
								{t("publishDialog.important")}
							</label>
						</div>
						<p className="text-muted-foreground text-xs">
							{forMembers
								? t("publishDialog.importantMembers")
								: t("publishDialog.importantOrganizations")}
						</p>
					</div>
				)}
				<DialogFooter>
					<Button variant="outline" onClick={() => close(false)}>
						{tc("cancel")}
					</Button>
					<Button
						disabled={!isReasonValid(reason) || pending}
						onClick={() => onSubmit(reason.trim(), consent && important)}
					>
						{t("publishDialog.confirm")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
