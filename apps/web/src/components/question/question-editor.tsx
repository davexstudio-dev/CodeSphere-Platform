"use client";

import type { QuestionView } from "@codesphere/contract";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Textarea } from "@codesphere/ui/components/atoms/textarea";
import { Field } from "@codesphere/ui/components/molecules/field";
import { TagInput } from "@codesphere/ui/components/molecules/tag-input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { errorCodeOf } from "@/i18n/errors";
import { useTagInputLabels } from "@/lib/use-tag-input-labels";
import { orpc } from "@/utils/orpc";

/**
 * The author edits their Question in place (#69), online only (spec §3). The edit carries the
 * version it started from: if the Question changed meanwhile, the server answers CONFLICT and the
 * text typed here is kept while the page reloads the current version.
 */
export function QuestionEditor({
	question,
	onDone,
}: {
	question: QuestionView;
	onDone: () => void;
}) {
	const t = useTranslations("question.edit");
	const tErrors = useTranslations("errors");
	const tagInputLabels = useTagInputLabels();
	const queryClient = useQueryClient();
	const [title, setTitle] = useState(question.title);
	const [body, setBody] = useState(question.body);
	const [tags, setTags] = useState<string[]>(question.tags);
	const update = useMutation(
		orpc.questions.update.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({
					queryKey: orpc.questions.key(),
				});
				toast.success(t("saved"));
				onDone();
			},
			onError: (error) => {
				toast.error(tErrors(errorCodeOf(error)));
				if (errorCodeOf(error) === "CONFLICT") {
					void queryClient.invalidateQueries({
						queryKey: orpc.questions.get.key({ input: { id: question.id } }),
					});
				}
			},
		}),
	);
	return (
		<form
			className="grid gap-4 rounded-2xl border border-border bg-card p-4"
			onSubmit={(event) => {
				event.preventDefault();
				update.mutate({
					id: question.id,
					expectedVersion: question.version,
					title,
					body,
					tags,
				});
			}}
		>
			<Field id="edit-title" label={t("title")} required>
				<Input
					id="edit-title"
					value={title}
					maxLength={200}
					required
					onChange={(event) => setTitle(event.target.value)}
				/>
			</Field>
			<Field id="edit-body" label={t("body")} required>
				<Textarea
					id="edit-body"
					mono
					className="min-h-48"
					value={body}
					maxLength={20_000}
					required
					onChange={(event) => setBody(event.target.value)}
				/>
			</Field>
			<Field id="edit-tags" label={t("tags")} description={t("tagsHint")}>
				<TagInput
					{...tagInputLabels}
					inputId="edit-tags"
					value={tags}
					onValueChange={setTags}
					max={5}
				/>
			</Field>
			<div className="flex justify-end gap-2">
				<Button type="button" variant="ghost" onClick={onDone}>
					{t("cancel")}
				</Button>
				<Button
					type="submit"
					disabled={update.isPending || tags.length === 0 || !title.trim()}
				>
					{update.isPending ? t("saving") : t("save")}
				</Button>
			</div>
		</form>
	);
}
