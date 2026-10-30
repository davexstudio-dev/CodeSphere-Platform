"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Textarea } from "@codesphere/ui/components/atoms/textarea";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@codesphere/ui/components/molecules/dialog";
import { Field } from "@codesphere/ui/components/molecules/field";
import { useMutation } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { fromLocalInput } from "@/lib/admin-hackathon";
import { orpc } from "@/utils/orpc";

const EMPTY = {
	name: "",
	slug: "",
	organizationSlug: "",
	summary: "",
	sourceUrl: "",
	submissionClose: "",
};

/** « Nouveau Hackathon » (#325): a draft, listed by a validated Organization. */
export function CreateHackathon({
	organizations,
	onCreated,
}: {
	organizations: readonly { slug: string; name: string }[];
	onCreated: (slug: string) => void;
}) {
	const t = useTranslations("admin.hackathons");
	const tc = useTranslations("admin.common");
	const [open, setOpen] = useState(false);
	const [form, setForm] = useState(EMPTY);
	const set = (key: keyof typeof EMPTY, value: string) =>
		setForm({ ...form, [key]: value });
	const create = useMutation(
		orpc.admin.hackathons.create.mutationOptions({
			onSuccess: (created) => {
				setOpen(false);
				setForm(EMPTY);
				onCreated(created.slug);
			},
		}),
	);
	const closes = fromLocalInput(form.submissionClose);

	return (
		<>
			<Button
				size="icon"
				variant="outline"
				aria-label={t("new")}
				title={t("new")}
				onClick={() => setOpen(true)}
			>
				<PlusIcon />
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("new")}</DialogTitle>
						<DialogDescription>{t("createDescription")}</DialogDescription>
					</DialogHeader>
					<form
						id="create-hackathon"
						className="grid gap-3"
						onSubmit={(event) => {
							event.preventDefault();
							if (closes) {
								create.mutate({
									name: form.name,
									slug: form.slug,
									organizationSlug: form.organizationSlug,
									summary: form.summary,
									sourceUrl: form.sourceUrl,
									submissionClose: closes,
									teamMin: 1,
									teamMax: 5,
									teamsEnabled: true,
								});
							}
						}}
					>
						<Field id="new-name" label={t("name")}>
							<Input
								id="new-name"
								required
								value={form.name}
								onChange={(e) => set("name", e.target.value)}
							/>
						</Field>
						<Field id="new-slug" label={t("slug")} description={t("slugHint")}>
							<Input
								id="new-slug"
								required
								pattern="[a-z0-9]+(-[a-z0-9]+)*"
								value={form.slug}
								onChange={(e) => set("slug", e.target.value)}
							/>
						</Field>
						<Field id="new-organizer" label={t("organizer")}>
							<select
								id="new-organizer"
								required
								className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
								value={form.organizationSlug}
								onChange={(e) => set("organizationSlug", e.target.value)}
							>
								<option value="" disabled />
								{organizations.map((o) => (
									<option key={o.slug} value={o.slug}>
										{o.name}
									</option>
								))}
							</select>
						</Field>
						<Field id="new-summary" label={t("summary")}>
							<Textarea
								id="new-summary"
								required
								value={form.summary}
								onChange={(e) => set("summary", e.target.value)}
							/>
						</Field>
						<Field id="new-source" label={t("sourceUrl")}>
							<Input
								id="new-source"
								required
								type="url"
								value={form.sourceUrl}
								onChange={(e) => set("sourceUrl", e.target.value)}
							/>
						</Field>
						<Field id="new-close" label={t("submissionClose")}>
							<Input
								id="new-close"
								required
								type="datetime-local"
								value={form.submissionClose}
								onChange={(e) => set("submissionClose", e.target.value)}
							/>
						</Field>
						{create.isError && (
							<p role="alert" className="text-destructive text-sm">
								{t("createFailed")}
							</p>
						)}
					</form>
					<DialogFooter>
						<Button variant="outline" onClick={() => setOpen(false)}>
							{tc("cancel")}
						</Button>
						<Button
							type="submit"
							form="create-hackathon"
							disabled={create.isPending}
						>
							{t("createAction")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
