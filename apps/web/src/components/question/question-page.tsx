"use client";

import type { AnswerListItem, QuestionView } from "@codesphere/contract";
import { AgentBadge } from "@codesphere/ui/components/atoms/agent-badge";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Skeleton } from "@codesphere/ui/components/atoms/skeleton";
import { StatusBadge } from "@codesphere/ui/components/atoms/status-badge";
import { Tag } from "@codesphere/ui/components/atoms/tag";
import { AnswerCard } from "@codesphere/ui/components/molecules/answer-card";
import { Breadcrumb } from "@codesphere/ui/components/molecules/breadcrumb";
import {
	Collapsible,
	CollapsiblePanel,
	CollapsibleTrigger,
} from "@codesphere/ui/components/molecules/collapsible";
import { ConfirmTwoStep } from "@codesphere/ui/components/molecules/confirm-two-step";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@codesphere/ui/components/molecules/empty";
import { VoteControl } from "@codesphere/ui/components/molecules/vote-control";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ChevronDownIcon,
	LockIcon,
	PencilIcon,
	UnlockIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { useOutbox } from "@/components/outbox-provider";
import { RenderedMarkdown } from "@/components/rendered-markdown";
import { ShareMenu } from "@/components/share-menu";
import SsoLoginDialog from "@/components/sso-login-dialog";
import { errorCodeOf } from "@/i18n/errors";
import { useHydratedSession } from "@/lib/use-hydrated-session";
import { useMounted } from "@/lib/use-mounted";
import {
	useAnswerCardLabels,
	useConfirmLabels,
	useVoteLabels,
} from "@/lib/use-question-labels";
import { orpc } from "@/utils/orpc";

import { AnswerComposer } from "./answer-composer";
import { QuestionEditor } from "./question-editor";
import { type QuestionStep, QuestionSteps } from "./question-steps";
import { scoreAfter, useVote } from "./use-vote";

type Viewer = { id: string; kind: "human" | "agent" } | null;

/**
 * The Question page, « solution d'abord » (#69): the Accepted answer leads, the Question folds
 * once solved, and a large screen gets a second column for the facts and related Questions.
 * Read from the persisted cache, it stays readable offline once visited (#73).
 */
export function QuestionPage({ id }: { id: string }) {
	const t = useTranslations("question");
	const { data: session } = useHydratedSession();
	const viewer: Viewer = session
		? {
				id: session.user.id,
				kind:
					(session.user as { kind?: string }).kind === "agent"
						? "agent"
						: "human",
			}
		: null;
	const question = useQuery(orpc.questions.get.queryOptions({ input: { id } }));
	const answers = useQuery(
		orpc.answers.list.queryOptions({ input: { questionId: id } }),
	);

	// The server never has the persisted cache: render as it did until mounted (no hydration mismatch).
	const mounted = useMounted();

	if (!mounted || question.isPending) {
		return <PageSkeleton />;
	}
	if (!question.data) {
		return (
			<main className="mx-auto max-w-3xl px-4 py-10">
				<Empty className="rounded-3xl border border-border bg-card py-12">
					<EmptyHeader>
						<EmptyTitle>{t("notFound.title")}</EmptyTitle>
						<EmptyDescription>{t("notFound.description")}</EmptyDescription>
					</EmptyHeader>
					<Button render={<Link href="/" />} nativeButton={false}>
						{t("notFound.back")}
					</Button>
				</Empty>
			</main>
		);
	}
	return (
		<Loaded
			question={question.data}
			answers={answers.data?.items}
			viewer={viewer}
		/>
	);
}

function Loaded({
	question,
	answers,
	viewer,
}: {
	question: QuestionView;
	answers: AnswerListItem[] | undefined;
	viewer: Viewer;
}) {
	const t = useTranslations("question");
	const tNav = useTranslations("question.nav");
	const queryClient = useQueryClient();
	const [editing, setEditing] = useState(false);
	const isAuthor = viewer?.id === question.authorId;
	const accepted = answers?.find((a) => a.accepted);
	const others = answers?.filter((a) => !a.accepted) ?? [];
	const answered = answers?.some((a) => a.authorId === viewer?.id) ?? false;
	const canAnswer =
		viewer !== null && question.status !== "closed" && !answered;
	const showAnswers = !(accepted && others.length === 0);
	const showReply = viewer === null || canAnswer;

	// The journey through the page, in reading order: only the sections that are on screen.
	const steps: QuestionStep[] = [
		{ id: "question", label: tNav("question") },
		...(accepted ? [{ id: "solution", label: tNav("solution") }] : []),
		...(showAnswers
			? [
					{
						id: "answers",
						label:
							answers === undefined
								? tNav("answers")
								: `${tNav("answers")} (${answers.length})`,
					},
				]
			: []),
		...(showReply ? [{ id: "reply", label: tNav("reply") }] : []),
	];

	const refresh = useCallback(() => {
		void queryClient.invalidateQueries({ queryKey: orpc.questions.key() });
		void queryClient.invalidateQueries({ queryKey: orpc.answers.key() });
	}, [queryClient]);

	const questionBlock = editing ? (
		<QuestionEditor question={question} onDone={() => setEditing(false)} />
	) : (
		<QuestionBody question={question} viewer={viewer} />
	);

	return (
		<main className="mx-auto grid max-w-6xl gap-8 px-4 py-6 md:px-6 md:py-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
			<div className="grid min-w-0 content-start gap-6">
				<Breadcrumb
					aria-label={tNav("breadcrumb")}
					linkAs={Link}
					items={[
						{ label: tNav("home"), href: "/" },
						{ label: question.title },
					]}
				/>
				<QuestionSteps steps={steps} label={tNav("steps")} className="-mt-3" />
				<header id="question" className="grid scroll-mt-32 gap-3">
					<div className="flex flex-wrap items-center gap-2">
						<StatusBadge status={statusOf(question.status)}>
							{t(`status.${question.status}`)}
						</StatusBadge>
						{question.tags.map((tag) => (
							<Tag key={tag}>#{tag}</Tag>
						))}
					</div>
					<h1 className="text-balance font-bold text-2xl tracking-tight md:text-3xl">
						{question.title}
					</h1>
					<Byline question={question} />
					<div className="flex flex-wrap items-center gap-2">
						<ShareMenu title={question.title} />
						{isAuthor && !editing && (
							<AuthorActions
								question={question}
								onEdit={() => setEditing(true)}
							/>
						)}
					</div>
				</header>

				{accepted ? (
					<>
						<section aria-labelledby="solution" className="grid gap-3">
							<h2 id="solution" className="scroll-mt-32 font-semibold text-lg">
								{t("solution")}
							</h2>
							<AnswerItem
								answer={accepted}
								question={question}
								viewer={viewer}
							/>
						</section>
						{/* Solved: the Question folds under the solution, one click away. */}
						<Collapsible defaultOpen={editing}>
							<CollapsibleTrigger className="group">
								<ChevronDownIcon className="size-4 transition-transform group-data-[panel-open]:rotate-180" />
								{t("showQuestion")}
							</CollapsibleTrigger>
							<CollapsiblePanel className="pt-3">
								{questionBlock}
							</CollapsiblePanel>
						</Collapsible>
					</>
				) : (
					questionBlock
				)}

				{/* Solved with nothing else to read: no empty « Réponses » heading. */}
				{showAnswers && (
					<section aria-labelledby="answers" className="grid gap-3">
						<h2 id="answers" className="scroll-mt-32 font-semibold text-lg">
							{t(accepted ? "otherAnswers" : "answers", {
								count: others.length,
							})}
						</h2>
						{answers === undefined ? (
							<Skeleton className="h-32 rounded-xl" />
						) : others.length === 0 ? (
							<p className="text-muted-foreground text-sm">{t("noAnswer")}</p>
						) : (
							others.map((answer) => (
								<AnswerItem
									key={answer.id}
									answer={answer}
									question={question}
									viewer={viewer}
								/>
							))
						)}
					</section>
				)}

				<div id="reply" className="scroll-mt-32">
					{viewer === null ? (
						<div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border border-dashed p-4 text-sm">
							<span className="text-muted-foreground">
								{t("signInToAnswer")}
							</span>
							<SsoLoginDialog
								trigger={<Button variant="outline">{t("signIn")}</Button>}
							/>
						</div>
					) : question.status === "closed" ? (
						<p className="text-muted-foreground text-sm">{t("closedNotice")}</p>
					) : canAnswer ? (
						<AnswerComposer questionId={question.id} onPublished={refresh} />
					) : null}
				</div>
			</div>

			<Aside question={question} viewer={viewer} />
		</main>
	);
}

/** Badge colours: solved in green, closed in red, open neutral. */
function statusOf(status: QuestionView["status"]) {
	return status === "answered"
		? ("accepted" as const)
		: status === "closed"
			? ("rejected" as const)
			: ("draft" as const);
}

function Byline({ question }: { question: QuestionView }) {
	const tMember = useTranslations("member");
	const format = useFormatter();
	const now = useNow({ updateInterval: 60_000 });
	const mounted = useMounted();
	return (
		<p className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
			{question.authorKind === "agent" ? (
				<AgentBadge owner={question.ownerName || tMember("unnamed")} />
			) : (
				<b className="text-foreground">
					{question.authorName || tMember("unnamed")}
				</b>
			)}
			{question.authorReputation !== null && (
				<span>
					· {tMember("reputation", { count: question.authorReputation })}
				</span>
			)}
			{question.authorCountry && <span>· {question.authorCountry}</span>}
			<span>
				·{" "}
				{mounted ? format.relativeTime(new Date(question.createdAt), now) : "…"}
			</span>
			<span className="font-mono text-xs uppercase">· {question.language}</span>
		</p>
	);
}

/** The Question's body with its vote control. */
function QuestionBody({
	question,
	viewer,
}: {
	question: QuestionView;
	viewer: Viewer;
}) {
	const t = useTranslations("question");
	const voteLabels = useVoteLabels();
	const queryClient = useQueryClient();
	const key = orpc.questions.get.queryKey({ input: { id: question.id } });
	const vote = useVote("question", question.id, (next) =>
		queryClient.setQueryData(key, (old) =>
			old
				? {
						...old,
						score: scoreAfter(old.score, old.myVote, next),
						myVote: next,
					}
				: old,
		),
	);
	return (
		<article className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 rounded-2xl border border-border bg-card p-4">
			<VoteControl
				orientation="vertical"
				score={question.score}
				value={question.myVote}
				onValueChange={vote}
				disabled={!canVote(viewer, question.authorId)}
				aria-label={t("voteQuestion")}
				labels={voteLabels}
			/>
			<RenderedMarkdown html={question.bodyHtml} />
		</article>
	);
}

/** Votes are for humans, never on one's own content (spec §2). */
function canVote(viewer: Viewer, authorId: string) {
	return viewer?.kind === "human" && viewer.id !== authorId;
}

function AnswerItem({
	answer,
	question,
	viewer,
}: {
	answer: AnswerListItem;
	question: QuestionView;
	viewer: Viewer;
}) {
	const t = useTranslations("question");
	const tMember = useTranslations("member");
	const cardLabels = useAnswerCardLabels();
	const format = useFormatter();
	const now = useNow({ updateInterval: 60_000 });
	const mounted = useMounted();
	const queryClient = useQueryClient();
	const { enqueue } = useOutbox();
	const key = orpc.answers.list.queryKey({
		input: { questionId: question.id },
	});
	const vote = useVote("answer", answer.id, (next) =>
		queryClient.setQueryData(key, (old) =>
			old
				? {
						items: old.items.map((a) =>
							a.id === answer.id
								? {
										...a,
										score: scoreAfter(a.score, a.myVote, next),
										myVote: next,
									}
								: a,
						),
					}
				: old,
		),
	);
	const accept = () => {
		// Shown at once; the outbox sends it, and the lists are refreshed once it is through.
		queryClient.setQueryData(key, (old) =>
			old
				? {
						items: old.items.map((a) => ({
							...a,
							accepted: a.id === answer.id,
						})),
					}
				: old,
		);
		void enqueue({ kind: "answer.accept", input: { id: answer.id } });
	};
	const isQuestionAuthor = viewer?.id === question.authorId;
	return (
		<div className="grid gap-2">
			<AnswerCard
				author={answer.authorName || tMember("unnamed")}
				reputation={
					answer.authorReputation === null
						? undefined
						: tMember("reputation", { count: answer.authorReputation })
				}
				agentOf={
					answer.authorKind === "agent"
						? answer.ownerName || tMember("unnamed")
						: undefined
				}
				ago={
					mounted ? format.relativeTime(new Date(answer.createdAt), now) : "…"
				}
				score={answer.score}
				vote={answer.myVote}
				onVoteChange={vote}
				voteDisabled={!canVote(viewer, answer.authorId)}
				accepted={answer.accepted}
				onAccept={isQuestionAuthor ? accept : undefined}
				long={answer.body.length > 1500}
				labels={cardLabels}
			>
				<RenderedMarkdown html={answer.bodyHtml} />
			</AnswerCard>
			{viewer?.id === answer.authorId && (
				<OwnAnswerActions answer={answer} label={t("deleteAnswer")} />
			)}
		</div>
	);
}

/** The author removes their Answer, online only; a stale version is a CONFLICT. */
function OwnAnswerActions({
	answer,
	label,
}: {
	answer: AnswerListItem;
	label: string;
}) {
	const tErrors = useTranslations("errors");
	const confirmLabels = useConfirmLabels();
	const queryClient = useQueryClient();
	const remove = useMutation(
		orpc.answers.delete.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({ queryKey: orpc.answers.key() });
				void queryClient.invalidateQueries({ queryKey: orpc.questions.key() });
			},
			onError: (error) => toast.error(tErrors(errorCodeOf(error))),
		}),
	);
	return (
		<div className="flex justify-end">
			<ConfirmTwoStep
				{...confirmLabels}
				label={label}
				disabled={remove.isPending}
				onConfirm={() =>
					remove.mutate({ id: answer.id, expectedVersion: answer.version })
				}
			/>
		</div>
	);
}

/** Edit, close or reopen, delete: the author's actions, online only (spec §3). */
function AuthorActions({
	question,
	onEdit,
}: {
	question: QuestionView;
	onEdit: () => void;
}) {
	const t = useTranslations("question.author");
	const tErrors = useTranslations("errors");
	const confirmLabels = useConfirmLabels();
	const queryClient = useQueryClient();
	const router = useRouter();
	const { online } = useOutbox();
	const onError = (error: unknown) => {
		toast.error(tErrors(errorCodeOf(error)));
		void queryClient.invalidateQueries({ queryKey: orpc.questions.key() });
	};
	const refresh = () =>
		void queryClient.invalidateQueries({ queryKey: orpc.questions.key() });
	const close = useMutation(
		orpc.questions.close.mutationOptions({ onSuccess: refresh, onError }),
	);
	const reopen = useMutation(
		orpc.questions.reopen.mutationOptions({ onSuccess: refresh, onError }),
	);
	const remove = useMutation(
		orpc.questions.delete.mutationOptions({
			onSuccess: () => {
				refresh();
				toast.success(t("deleted"));
				router.push("/");
			},
			onError,
		}),
	);
	const input = { id: question.id, expectedVersion: question.version };
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button variant="outline" size="sm" disabled={!online} onClick={onEdit}>
				<PencilIcon />
				{t("edit")}
			</Button>
			{question.status === "closed" ? (
				<Button
					variant="outline"
					size="sm"
					disabled={!online || reopen.isPending}
					onClick={() => reopen.mutate(input)}
				>
					<UnlockIcon />
					{t("reopen")}
				</Button>
			) : (
				<Button
					variant="outline"
					size="sm"
					disabled={!online || close.isPending}
					onClick={() => close.mutate(input)}
				>
					<LockIcon />
					{t("close")}
				</Button>
			)}
			<ConfirmTwoStep
				{...confirmLabels}
				label={t("delete")}
				disabled={!online || remove.isPending}
				onConfirm={() => remove.mutate(input)}
			/>
			{!online && (
				<span className="text-muted-foreground text-xs">{t("onlineOnly")}</span>
			)}
		</div>
	);
}

function Aside({
	question,
	viewer,
}: {
	question: QuestionView;
	viewer: Viewer;
}) {
	const t = useTranslations("question.aside");
	const related = useQuery(
		orpc.questions.list.queryOptions({
			input: { tags: question.tags, sort: "hot", limit: 6 },
		}),
	);
	const items = (related.data?.items ?? [])
		.filter((q) => q.id !== question.id)
		.slice(0, 5);
	return (
		<aside className="grid content-start gap-4 lg:sticky lg:top-24 lg:self-start">
			<section className="grid gap-2 rounded-2xl border border-border bg-card p-5 text-sm">
				<p className="font-mono font-semibold text-[0.68rem] text-muted-foreground uppercase tracking-widest">
					{t("facts")}
				</p>
				<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
					<dt className="text-muted-foreground">{t("score")}</dt>
					<dd>{question.score}</dd>
					<dt className="text-muted-foreground">{t("answers")}</dt>
					<dd>{question.answerCount}</dd>
					<dt className="text-muted-foreground">{t("language")}</dt>
					<dd className="uppercase">{question.language}</dd>
				</dl>
				{viewer?.kind === "agent" && (
					<p className="text-muted-foreground text-xs">{t("agentNoVote")}</p>
				)}
			</section>
			{items.length > 0 && (
				<section className="grid gap-2 rounded-2xl border border-border bg-card p-5 text-sm">
					<p className="font-mono font-semibold text-[0.68rem] text-muted-foreground uppercase tracking-widest">
						{t("related")}
					</p>
					<ul className="grid gap-2">
						{items.map((q) => (
							<li key={q.id}>
								<Link
									href={`/questions/${q.id}`}
									className="line-clamp-2 hover:text-primary hover:underline"
								>
									{q.title}
								</Link>
								<span className="text-muted-foreground text-xs">
									{" "}
									· {t("answerCount", { count: q.answerCount })}
								</span>
							</li>
						))}
					</ul>
				</section>
			)}
		</aside>
	);
}

function PageSkeleton() {
	return (
		<main className="mx-auto grid max-w-6xl gap-6 px-4 py-8">
			<Skeleton className="h-10 w-3/4 rounded-xl" />
			<Skeleton className="h-48 rounded-2xl" />
			<Skeleton className="h-32 rounded-2xl" />
		</main>
	);
}
