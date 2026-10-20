"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Textarea } from "@codesphere/ui/components/atoms/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { CountryPicker } from "@/components/country-picker";
import { JobCard } from "@/components/jobs/job-card";
import Link from "@/components/link";
import { errorCodeOf } from "@/i18n/errors";
import { authClient } from "@/lib/auth-client";
import { useMounted } from "@/lib/use-mounted";
import { orpc } from "@/utils/orpc";

/** Publish a job posting for one of the Member's validated Organizations (#258). */
export function JobPublish() {
	const t = useTranslations("jobs.publishPage");
	const tj = useTranslations("jobs");
	const router = useRouter();
	const queryClient = useQueryClient();
	const { data: session, isPending: sessionPending } = authClient.useSession();
	// The session is only known in the browser: the first render must match the server's.
	const mounted = useMounted();
	const orgs = useQuery({
		...orpc.organizations.mine.queryOptions({ input: {} }),
		enabled: Boolean(session),
	});
	const validated = (orgs.data?.items ?? []).filter(
		(o) => o.status === "validated",
	);
	const mine = useQuery({
		...orpc.jobs.mine.queryOptions({ input: {} }),
		enabled: Boolean(session),
	});
	const [slug, setSlug] = useState("");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [tags, setTags] = useState("");
	const [country, setCountry] = useState("");
	const [remote, setRemote] = useState(false);
	const [applyUrl, setApplyUrl] = useState("");
	const [applyEmail, setApplyEmail] = useState("");
	const publish = useMutation(
		orpc.jobs.publish.mutationOptions({
			onSuccess: (job) => {
				toast.success(t("done"));
				void queryClient.invalidateQueries({ queryKey: orpc.jobs.key() });
				router.push(`/jobs/${job.id}` as never);
			},
			onError: (error) => {
				const code = errorCodeOf(error);
				toast.error(
					code === "BAD_REQUEST"
						? t("errors.rule")
						: code === "CONFLICT"
							? t("errors.limit")
							: code === "FORBIDDEN"
								? t("errors.forbidden")
								: t("errors.generic"),
				);
			},
		}),
	);

	return (
		<main className="mx-auto grid max-w-2xl gap-8 px-4 py-10 md:px-8">
			<header className="grid gap-2">
				<h1 className="font-semibold text-3xl">{t("title")}</h1>
				<p className="text-muted-foreground">{t("intro")}</p>
			</header>
			{mounted && !sessionPending && !session ? (
				<p className="text-muted-foreground">{t("signIn")}</p>
			) : orgs.isSuccess && validated.length === 0 ? (
				<p className="rounded-2xl border p-4 text-sm">
					{t("needOrganization")}{" "}
					<Link href="/organizations/new" className="underline">
						{t("applyOrganization")}
					</Link>
				</p>
			) : (
				<form
					className="grid gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						publish.mutate({
							organizationSlug: slug || validated[0]?.slug || "",
							title,
							description,
							tags: tags
								.split(",")
								.map((x) => x.trim())
								.filter(Boolean)
								.slice(0, 5),
							country: country.trim().toUpperCase(),
							remote,
							applyUrl: applyUrl || undefined,
							applyEmail: applyEmail || undefined,
						});
					}}
				>
					<select
						aria-label={t("organization")}
						className="h-9 rounded-md border border-input bg-background px-3 text-sm"
						value={slug || validated[0]?.slug || ""}
						onChange={(e) => setSlug(e.target.value)}
					>
						{validated.map((o) => (
							<option key={o.slug} value={o.slug}>
								{o.name}
							</option>
						))}
					</select>
					<Input
						required
						minLength={3}
						maxLength={140}
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						aria-label={t("jobTitle")}
						placeholder={t("jobTitle")}
					/>
					<Textarea
						required
						minLength={20}
						maxLength={4000}
						rows={8}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						aria-label={t("description")}
						placeholder={t("description")}
					/>
					<Input
						required
						value={tags}
						onChange={(e) => setTags(e.target.value)}
						aria-label={t("tags")}
						placeholder={t("tags")}
					/>
					<div className="flex flex-wrap items-center gap-2">
						<div className="w-56">
							<CountryPicker
								value={country}
								onValueChange={setCountry}
								ariaLabel={t("country")}
							/>
						</div>
						<Button
							type="button"
							variant={remote ? "default" : "outline"}
							aria-pressed={remote}
							onClick={() => setRemote((on) => !on)}
						>
							{tj("remote")}
						</Button>
					</div>
					<p className="text-muted-foreground text-xs">{t("applyHint")}</p>
					<Input
						type="url"
						value={applyUrl}
						onChange={(e) => setApplyUrl(e.target.value)}
						aria-label={t("applyUrl")}
						placeholder={t("applyUrl")}
					/>
					<Input
						type="email"
						value={applyEmail}
						onChange={(e) => setApplyEmail(e.target.value)}
						aria-label={t("applyEmail")}
						placeholder={t("applyEmail")}
					/>
					<p className="text-muted-foreground text-xs">{t("rules")}</p>
					<Button
						type="submit"
						disabled={publish.isPending || !country}
						className="w-fit"
					>
						{t("submit")}
					</Button>
				</form>
			)}
			{(mine.data?.items.length ?? 0) > 0 && (
				<section aria-labelledby="mine" className="grid gap-3">
					<h2 id="mine" className="font-semibold text-xl">
						{t("mine")}
					</h2>
					<ul className="grid gap-2">
						{mine.data?.items.map((job) => (
							<li key={job.id} className="grid gap-1">
								<JobCard job={job} />
								<span className="px-1 text-muted-foreground text-xs">
									{job.status === "removed"
										? t("removed")
										: job.expired
											? t("expired")
											: t("live")}{" "}
									· {t("applicants", { count: job.applicants })}
								</span>
							</li>
						))}
					</ul>
				</section>
			)}
		</main>
	);
}
