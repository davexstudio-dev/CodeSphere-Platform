"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@codesphere/ui/components/molecules/alert";
import { useMutation } from "@tanstack/react-query";
import { AlertCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import AdminFrame from "@/components/admin-frame";
import Link from "@/components/link";
import { connectErrorMessage } from "@/lib/admin-social";
import { orpc } from "@/utils/orpc";

/**
 * Where X and LinkedIn send the Admin back (#266). The attempt is single-use, so the code is
 * exchanged exactly once, even under React's double effect in development.
 */
export default function SocialCallbackPage() {
	const t = useTranslations("admin.social");
	const router = useRouter();
	const started = useRef(false);
	const complete = useMutation(
		orpc.admin.social.completeConnect.mutationOptions({
			onSuccess: ({ platform }) => {
				router.replace(`/admin/social?connected=${platform}`);
			},
		}),
	);

	useEffect(() => {
		if (started.current) {
			return;
		}
		started.current = true;
		complete.mutate({ callbackUrl: window.location.href });
	}, [complete.mutate]);

	return (
		<AdminFrame title={t("title")} description={t("callbackDescription")}>
			{complete.isError ? (
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertTitle>
						{connectErrorMessage(complete.error, t("error"))}
					</AlertTitle>
					<AlertDescription>
						<Button
							variant="link"
							size="sm"
							render={<Link href="/admin/social" />}
							nativeButton={false}
						>
							{t("back")}
						</Button>
					</AlertDescription>
				</Alert>
			) : (
				<p className="text-muted-foreground text-sm">{t("finishing")}</p>
			)}
		</AdminFrame>
	);
}
