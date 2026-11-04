"use client";

import { HACKATHON_REPORT_REASONS } from "@codesphere/contract";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import SsoLoginDialog from "@/components/sso-login-dialog";
import { errorCodeOf } from "@/i18n/errors";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

/** « Signaler »: a signed-in Member tells the Admins a Hackathon is wrong (#326). */
export function HackathonReport({ slug }: { slug: string }) {
	const t = useTranslations("hackathon.report");
	const { data: session } = authClient.useSession();
	const [open, setOpen] = useState(false);
	const [signingIn, setSigningIn] = useState(false);
	const [reason, setReason] = useState<
		(typeof HACKATHON_REPORT_REASONS)[number]
	>(HACKATHON_REPORT_REASONS[0]);
	const [comment, setComment] = useState("");
	const report = useMutation(
		orpc.hackathons.report.mutationOptions({
			onSuccess: () => {
				toast.success(t("sent"));
				setOpen(false);
				setComment("");
			},
			onError: (error) =>
				toast.error(
					errorCodeOf(error) === "FORBIDDEN" ? t("forbidden") : t("failed"),
				),
		}),
	);

	return (
		<div className="grid gap-2">
			<Button
				size="sm"
				variant="ghost"
				className="w-fit"
				onClick={() => (session ? setOpen((o) => !o) : setSigningIn(true))}
			>
				{t("button")}
			</Button>
			{open && (
				<form
					className="grid gap-2 rounded-xl border p-3"
					onSubmit={(event) => {
						event.preventDefault();
						report.mutate({
							slug,
							reason,
							comment: comment.trim() || undefined,
						});
					}}
				>
					<label htmlFor="report-reason" className="font-medium text-sm">
						{t("why")}
					</label>
					<select
						id="report-reason"
						value={reason}
						onChange={(e) =>
							setReason(
								e.target.value as (typeof HACKATHON_REPORT_REASONS)[number],
							)
						}
						className="rounded-md border bg-background px-2 py-1.5 text-sm"
					>
						{HACKATHON_REPORT_REASONS.map((value) => (
							<option key={value} value={value}>
								{t(`reasons.${value}`)}
							</option>
						))}
					</select>
					<Input
						value={comment}
						maxLength={300}
						onChange={(e) => setComment(e.target.value)}
						aria-label={t("comment")}
						placeholder={t("comment")}
					/>
					<Button type="submit" size="sm" disabled={report.isPending}>
						{t("send")}
					</Button>
				</form>
			)}
			<SsoLoginDialog open={signingIn} onOpenChange={setSigningIn} />
		</div>
	);
}
