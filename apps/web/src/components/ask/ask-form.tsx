"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Skeleton } from "@codesphere/ui/components/atoms/skeleton";
import { Tag } from "@codesphere/ui/components/atoms/tag";
import { Textarea } from "@codesphere/ui/components/atoms/textarea";
import {
	Bubble,
	BubbleContent,
	BubbleGroup,
} from "@codesphere/ui/components/molecules/bubble";
import { Field } from "@codesphere/ui/components/molecules/field";
import { RelatedQuestions } from "@codesphere/ui/components/molecules/related-questions";
import { SegmentedControl } from "@codesphere/ui/components/molecules/segmented-control";
import { Stepper } from "@codesphere/ui/components/molecules/stepper";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@codesphere/ui/components/molecules/tabs";
import { TagInput } from "@codesphere/ui/components/molecules/tag-input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { MarkdownPreview } from "@/components/markdown-preview";
import { useOutbox, useOutboxEntry } from "@/components/outbox-provider";
import {
	ASK_STEPS,
	type AskError,
	type AskField,
	prefilled,
	type QuestionDraft,
	stepErrors,
	stepOf,
} from "@/lib/ask";
import { useDraft } from "@/lib/use-draft";
import { useTagInputLabels } from "@/lib/use-tag-input-labels";
import { orpc } from "@/utils/orpc";

const LANGUAGES = ["fr", "en"] as const;

/**
 * « Poser une question » (#68): title → details → Tags and language → review. Related Questions
 * appear while the title is typed; the text is a Draft kept on the device, offline included, and
 * publishing goes through the outbox (#74). On a phone the finished steps read as a conversation.
 */
export function AskForm() {
	const t = useTranslations("ask");
	const tErrors = useTranslations("errors");
	const tagInputLabels = useTagInputLabels();
	const locale = useLocale();
	const router = useRouter();
	const queryClient = useQueryClient();
	const params = useSearchParams();
	const { enqueue, dismiss, online } = useOutbox();
	const draft = useDraft<QuestionDraft>("question:new", {
		title: "",
		body: "",
		tags: [],
		language: locale === "en" ? "en" : "fr",
		idempotencyKey: crypto.randomUUID(),
	});
	const [step, setStep] = useState(0);
	const [errors, setErrors] = useState<Partial<Record<AskField, AskError>>>({});
	const [entryId, setEntryId] = useState<string | null>(null);
	const entry = useOutboxEntry(entryId);
	const value = draft.value;

	// The Tag of the page that opened the form, once the stored Draft is known.
	const tag = params.get("tag");
	const { ready, setValue } = draft;
	useEffect(() => {
		if (ready && tag) {
			const next = prefilled(draft.value, tag);
			if (next !== draft.value) {
				setValue(next);
			}
		}
		// Only when the Draft is first ready: the Member may remove the Tag afterwards.
	}, [ready, tag]);

	// Published: open the Question, and the Draft is done with. The form shows « published »
	// meanwhile, never the emptied Draft (it flashed as a blank review step).
	const [published, setPublished] = useState(false);
	useEffect(() => {
		if (entry?.state === "sent") {
			const created = entry.result as { id?: string } | undefined;
			setPublished(true);
			dismiss(entry.id);
			draft.discard();
			// The « Getting started » checklist reads the first Question from the profile.
			void queryClient.invalidateQueries({ queryKey: orpc.members.key() });
			// And the feeds must show the new Question on the way back home.
			void queryClient.invalidateQueries({ queryKey: orpc.feed.key() });
			void queryClient.invalidateQueries({ queryKey: orpc.questions.key() });
			if (created?.id) {
				router.push(`/questions/${created.id}`);
			}
		}
	}, [entry, dismiss, draft, router, queryClient]);

	// A field the server refused sends the Member back to its step, with the message on it.
	useEffect(() => {
		if (entry?.state === "rejected" && entry.field) {
			setStep(stepOf(entry.field));
			if (
				entry.field === "title" ||
				entry.field === "body" ||
				entry.field === "tags"
			) {
				setErrors({ [entry.field]: "invalid" });
			}
		}
	}, [entry]);

	const set = <K extends keyof QuestionDraft>(key: K, v: QuestionDraft[K]) => {
		setErrors((current) => ({ ...current, [key]: undefined }));
		if (entry?.state === "rejected") {
			dismiss(entry.id);
			setEntryId(null);
		}
		draft.setValue({ ...value, [key]: v });
	};

	const next = () => {
		const found = stepErrors(value, ASK_STEPS[step] ?? "review");
		setErrors(found);
		if (Object.keys(found).length === 0) {
			setStep((s) => Math.min(s + 1, ASK_STEPS.length - 1));
		}
	};

	const publish = async () => {
		const found = stepErrors(value, "review");
		setErrors(found);
		if (Object.keys(found).length > 0) {
			return;
		}
		setEntryId(
			await enqueue({
				kind: "question.create",
				input: {
					idempotencyKey: value.idempotencyKey,
					title: value.title.trim(),
					body: value.body,
					language: value.language,
					tags: value.tags,
				},
			}),
		);
	};

	if (!draft.ready) {
		return <Skeleton className="h-96 rounded-3xl" />;
	}

	const errorText = (field: AskField) =>
		errors[field] ? t(`errors.${errors[field]}`) : undefined;
	const steps = ASK_STEPS.map((s) => t(`steps.${s}`));
	const waitingOffline = entry?.state === "pending" && !online;

	if (published) {
		return (
			<p
				role="status"
				className="rounded-2xl border border-border bg-card p-6 text-muted-foreground text-sm"
			>
				{t("published")}
			</p>
		);
	}

	return (
		<div className="grid grid-cols-1 gap-6">
			<Stepper steps={steps} current={step} />

			{/* Phone: the steps already answered, as a conversation. */}
			{step > 0 && (
				<BubbleGroup className="md:hidden">
					<Bubble variant="muted">
						<BubbleContent>{t("prompts.title")}</BubbleContent>
					</Bubble>
					<Bubble align="end">
						<BubbleContent>{value.title}</BubbleContent>
					</Bubble>
					{step > 1 && (
						<>
							<Bubble variant="muted">
								<BubbleContent>{t("prompts.details")}</BubbleContent>
							</Bubble>
							<Bubble align="end">
								<BubbleContent className="line-clamp-3">
									{value.body}
								</BubbleContent>
							</Bubble>
						</>
					)}
				</BubbleGroup>
			)}

			<form
				className="grid gap-5 rounded-3xl border border-border bg-card p-5 md:p-6"
				noValidate
				onSubmit={(event) => {
					event.preventDefault();
					if (step === ASK_STEPS.length - 1) {
						void publish();
					} else {
						next();
					}
				}}
			>
				{step === 0 && (
					<TitleStep
						value={value.title}
						onChange={(v) => set("title", v)}
						error={errorText("title")}
					/>
				)}
				{step === 1 && (
					<Field
						id="ask-body"
						label={t("fields.body")}
						description={t("fields.bodyHint")}
						error={errorText("body")}
						required
					>
						<Tabs defaultValue="write">
							<TabsList>
								<TabsTrigger value="write">{t("write")}</TabsTrigger>
								<TabsTrigger value="preview">{t("preview")}</TabsTrigger>
							</TabsList>
							<TabsContent value="write">
								<Textarea
									id="ask-body"
									className="min-h-64 font-mono"
									value={value.body}
									maxLength={20_000}
									aria-invalid={Boolean(errors.body)}
									onChange={(event) => set("body", event.target.value)}
								/>
							</TabsContent>
							<TabsContent value="preview">
								<div className="min-h-64 rounded-md border border-border p-3">
									{value.body.trim() ? (
										<MarkdownPreview body={value.body} />
									) : (
										<p className="text-muted-foreground text-sm">
											{t("nothingToPreview")}
										</p>
									)}
								</div>
							</TabsContent>
						</Tabs>
					</Field>
				)}
				{step === 2 && (
					<div className="grid gap-5">
						<Field
							id="ask-tags"
							label={t("fields.tags")}
							description={t("fields.tagsHint")}
							error={errorText("tags")}
							required
						>
							<TagInput
								{...tagInputLabels}
								inputId="ask-tags"
								value={value.tags}
								onValueChange={(tags) => set("tags", tags)}
								max={5}
								invalid={Boolean(errors.tags)}
							/>
						</Field>
						<div className="grid gap-2">
							<p className="font-medium text-sm">{t("fields.language")}</p>
							<SegmentedControl
								options={LANGUAGES.map((l) => t(`languages.${l}`))}
								value={t(`languages.${value.language}`)}
								onValueChange={(label) =>
									set(
										"language",
										LANGUAGES.find((l) => t(`languages.${l}`) === label) ??
											value.language,
									)
								}
							/>
						</div>
					</div>
				)}
				{step === 3 && <Review draft={value} />}

				{entry?.state === "rejected" && (
					<p role="alert" className="text-destructive text-sm">
						{t("rejected", { reason: tErrors(entry.reason ?? "BAD_REQUEST") })}
					</p>
				)}
				{waitingOffline && (
					<p role="status" className="text-muted-foreground text-sm">
						{t("queued")}{" "}
						<Link href="/" className="text-primary underline">
							{t("backHome")}
						</Link>
					</p>
				)}

				<div className="flex flex-wrap justify-between gap-2">
					<Button
						type="button"
						variant="ghost"
						disabled={step === 0}
						onClick={() => setStep((s) => Math.max(0, s - 1))}
					>
						{t("back")}
					</Button>
					<Button
						type="submit"
						disabled={entry?.state === "sending" || waitingOffline}
					>
						{step === ASK_STEPS.length - 1
							? entry?.state === "sending"
								? t("publishing")
								: t("publish")
							: t("next")}
					</Button>
				</div>
			</form>
			<p className="text-muted-foreground text-xs">{t("draftNotice")}</p>
		</div>
	);
}

function TitleStep({
	value,
	onChange,
	error,
}: {
	value: string;
	onChange: (value: string) => void;
	error?: string;
}) {
	const t = useTranslations("ask");
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value.trim()), 350);
		return () => clearTimeout(timer);
	}, [value]);
	const related = useQuery({
		...orpc.questions.list.queryOptions({
			input: { q: debounced, sort: "hot", limit: 5 },
		}),
		enabled: debounced.length >= 8,
		meta: { silent: true },
	});
	return (
		<div className="grid gap-4">
			<Field
				id="ask-title"
				label={t("fields.title")}
				description={t("fields.titleHint")}
				error={error}
				required
			>
				<Input
					id="ask-title"
					value={value}
					maxLength={200}
					autoFocus
					aria-invalid={Boolean(error)}
					placeholder={t("fields.titlePlaceholder")}
					onChange={(event) => onChange(event.target.value)}
				/>
			</Field>
			<RelatedQuestions
				labels={{
					region: t("related.region"),
					title: t("related.title"),
					answers: (count) => t("related.answers", { count }),
				}}
				questions={(related.data?.items ?? []).map((q) => ({
					id: q.id,
					title: q.title,
					answers: q.answerCount,
					answered: q.status === "answered",
					href: `/questions/${q.id}`,
				}))}
			/>
		</div>
	);
}

function Review({ draft }: { draft: QuestionDraft }) {
	const t = useTranslations("ask");
	return (
		<div className="grid gap-4">
			<h2 className="text-balance font-bold text-xl">{draft.title}</h2>
			<div className="flex flex-wrap gap-2">
				{draft.tags.map((tag) => (
					<Tag key={tag}>#{tag}</Tag>
				))}
				<span className="font-mono text-muted-foreground text-xs uppercase">
					{t(`languages.${draft.language}`)}
				</span>
			</div>
			<div className="rounded-md border border-border p-3">
				<MarkdownPreview body={draft.body} />
			</div>
		</div>
	);
}
