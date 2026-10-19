"use client";

import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Textarea } from "@codesphere/ui/components/atoms/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import SsoLoginDialog from "@/components/sso-login-dialog";
import { errorCodeOf } from "@/i18n/errors";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

/** The application of an Organization and the status of the Member's earlier ones (#257). */
export function OrganizationApply() {
	const t = useTranslations("organizations");
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();
	const [signingIn, setSigningIn] = useState(false);
	const [name, setName] = useState("");
	const [website, setWebsite] = useState("");
	const [contactEmail, setContactEmail] = useState("");
	const [country, setCountry] = useState("");
	const [description, setDescription] = useState("");
	const mine = useQuery({
		...orpc.organizations.mine.queryOptions({ input: {} }),
		enabled: Boolean(session),
	});
	const apply = useMutation(
		orpc.organizations.request.mutationOptions({
			onSuccess: () => {
				toast.success(t("applied"));
				setName("");
				setWebsite("");
				setContactEmail("");
				setDescription("");
				void queryClient.invalidateQueries({
					queryKey: orpc.organizations.mine.key(),
				});
			},
			onError: (error) => {
				const code = errorCodeOf(error);
				toast.error(
					code === "CONFLICT"
						? t("errors.conflict")
						: code === "BAD_REQUEST"
							? t("errors.domain")
							: code === "FORBIDDEN"
								? t("errors.forbidden")
								: t("errors.generic"),
				);
			},
		}),
	);

	return (
		<main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10 md:px-8">
			<header className="flex flex-col gap-2">
				<h1 className="font-semibold text-3xl">{t("applyTitle")}</h1>
				<p className="text-muted-foreground">{t("applyIntro")}</p>
			</header>

			<form
				className="grid gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					if (!session) {
						setSigningIn(true);
						return;
					}
					apply.mutate({
						name,
						website,
						contactEmail,
						country: country.trim().toUpperCase(),
						description,
					});
				}}
			>
				<Input
					required
					value={name}
					maxLength={120}
					onChange={(e) => setName(e.target.value)}
					aria-label={t("name")}
					placeholder={t("name")}
				/>
				<Input
					required
					type="url"
					value={website}
					onChange={(e) => setWebsite(e.target.value)}
					aria-label={t("website")}
					placeholder="https://…"
				/>
				<Input
					required
					type="email"
					value={contactEmail}
					onChange={(e) => setContactEmail(e.target.value)}
					aria-label={t("contactEmail")}
					placeholder={t("contactEmail")}
				/>
				<p className="-mt-1 text-muted-foreground text-xs">
					{t("contactEmailHint")}
				</p>
				<Input
					required
					value={country}
					maxLength={5}
					onChange={(e) => setCountry(e.target.value)}
					aria-label={t("country")}
					placeholder={t("countryHint")}
				/>
				<Textarea
					value={description}
					maxLength={1000}
					onChange={(e) => setDescription(e.target.value)}
					aria-label={t("description")}
					placeholder={t("description")}
				/>
				<Button type="submit" disabled={apply.isPending} className="w-fit">
					{t("submit")}
				</Button>
			</form>

			{session && (mine.data?.items.length ?? 0) > 0 && (
				<section aria-labelledby="mine" className="grid gap-3">
					<h2 id="mine" className="font-semibold text-xl">
						{t("mine")}
					</h2>
					<ul className="grid gap-2">
						{mine.data?.items.map((org) => (
							<li key={org.id} className="grid gap-1 rounded-xl border p-3">
								<span className="flex items-center gap-2">
									<span className="font-medium">{org.name}</span>
									<Badge
										variant={
											org.status === "validated"
												? "success"
												: org.status === "pending"
													? "warning"
													: "destructive"
										}
									>
										{t(`status.${org.status}`)}
									</Badge>
								</span>
								{org.statusReason && (
									<span className="text-muted-foreground text-sm">
										{org.statusReason}
									</span>
								)}
								{org.status === "validated" && (
									<a
										href={`/organizations/${org.slug}`}
										className="text-sm hover:underline"
									>
										{t("viewProfile")}
									</a>
								)}
							</li>
						))}
					</ul>
				</section>
			)}
			<SsoLoginDialog open={signingIn} onOpenChange={setSigningIn} />
		</main>
	);
}
