"use client";

import { Input } from "@codesphere/ui/components/atoms/input";
import { Textarea } from "@codesphere/ui/components/atoms/textarea";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@codesphere/ui/components/molecules/alert";
import { ConfirmTwoStep } from "@codesphere/ui/components/molecules/confirm-two-step";
import { Field } from "@codesphere/ui/components/molecules/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@codesphere/ui/components/molecules/select";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import {
	publicationTone,
	publishErrorKey,
	shareableQuestions,
} from "@/lib/admin-social";
import { orpc } from "@/utils/orpc";

type Platform = "bluesky" | "linkedin" | "x";
type ShareType = "question" | "hackathon";

const MAX_TEXT = 200;
const SEARCH_DELAY_MS = 300;

/**
 * Publishes a public page to an official account (#265). A post cannot be taken back and goes out
 * once per content and platform, hence the two-step confirmation and the state shown afterwards.
 */
export function SocialPublishForm({ platforms }: { platforms: Platform[] }) {
	const t = useTranslations("admin.social");
	const tp = useTranslations("admin.social.publish");
	const tc = useTranslations("admin.common");
	const [type, setType] = useState<ShareType>("question");
	const [id, setId] = useState("");
	const [platform, setPlatform] = useState<Platform | "">("");
	const [text, setText] = useState("");
	const [search, setSearch] = useState("");
	const [q, setQ] = useState("");

	useEffect(() => {
		const timer = setTimeout(() => setQ(search.trim()), SEARCH_DELAY_MS);
		return () => clearTimeout(timer);
	}, [search]);

	const questions = useQuery({
		...orpc.questions.list.queryOptions({
			input: { limit: 20, sort: "recent", ...(q ? { q } : {}) },
		}),
		enabled: type === "question",
	});
	const hackathons = useQuery({
		...orpc.hackathons.list.queryOptions({ input: { limit: 50 } }),
		enabled: type === "hackathon",
	});
	const publish = useMutation(orpc.admin.social.publish.mutationOptions());

	const contents =
		type === "question"
			? shareableQuestions(questions.data?.items ?? [])
			: (hackathons.data?.items ?? []).map((hackathon) => ({
					value: hackathon.slug,
					label: hackathon.name,
				}));
	const chosenPlatform = platforms.length === 1 ? platforms[0] : platform;
	const contentLabel = contents.find((item) => item.value === id)?.label;
	const typeItems = [
		{ value: "question", label: tp("types.question") },
		{ value: "hackathon", label: tp("types.hackathon") },
	];
	const platformItems = platforms.map((value) => ({
		value,
		label: t(`platforms.${value}`),
	}));
	const result = publish.data;

	return (
		<section
			aria-labelledby="social-publish-title"
			className="flex flex-col gap-4 rounded-xl border bg-card p-4"
		>
			<div>
				<h2 id="social-publish-title" className="font-medium">
					{tp("title")}
				</h2>
				<p className="text-muted-foreground text-sm">{tp("description")}</p>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field id="social-type" label={tp("type")}>
					<Select
						value={type}
						items={typeItems}
						onValueChange={(value) => {
							setType(value as ShareType);
							setId("");
							publish.reset();
						}}
					>
						<SelectTrigger id="social-type" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{typeItems.map((item) => (
								<SelectItem key={item.value} value={item.value}>
									{item.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
				<Field id="social-platform" label={tp("platform")}>
					<Select
						value={chosenPlatform}
						items={platformItems}
						onValueChange={(value) => {
							setPlatform(value as Platform);
							publish.reset();
						}}
					>
						<SelectTrigger id="social-platform" className="w-full">
							<SelectValue placeholder={tp("choosePlatform")} />
						</SelectTrigger>
						<SelectContent>
							{platformItems.map((item) => (
								<SelectItem key={item.value} value={item.value}>
									{item.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
			</div>
			{type === "question" && (
				<Field id="social-search" label={tp("search")}>
					<Input
						id="social-search"
						type="search"
						value={search}
						onChange={(event) => {
							setSearch(event.target.value);
							// A new search may hide the choice: never publish what is no longer shown.
							setId("");
							publish.reset();
						}}
					/>
				</Field>
			)}
			<Field id="social-content" label={tp("content")}>
				<Select
					value={id}
					items={contents}
					onValueChange={(value) => {
						setId(value as string);
						publish.reset();
					}}
				>
					<SelectTrigger id="social-content" className="w-full">
						<SelectValue placeholder={tp("chooseContent")} />
					</SelectTrigger>
					<SelectContent>
						{contents.map((item) => (
							<SelectItem key={item.value} value={item.value}>
								{item.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			<Field
				id="social-text"
				label={tp("text")}
				description={tp("textHint", { max: MAX_TEXT })}
			>
				<Textarea
					id="social-text"
					value={text}
					maxLength={MAX_TEXT}
					placeholder={contentLabel}
					onChange={(event) => setText(event.target.value)}
				/>
			</Field>
			{result && (
				<Alert variant={publicationTone(result.state)}>
					{result.state !== "published" && <AlertCircleIcon />}
					<AlertTitle>{tp(`states.${result.state}`)}</AlertTitle>
					{(result.postUrl || result.message) && (
						<AlertDescription>
							{result.postUrl && (
								<a
									href={result.postUrl}
									target="_blank"
									rel="noreferrer"
									className="underline"
								>
									{tp("viewPost")}
								</a>
							)}
							{result.message && <p>{result.message}</p>}
						</AlertDescription>
					)}
				</Alert>
			)}
			{publish.isError && (
				<Alert variant="destructive">
					<AlertCircleIcon />
					<AlertTitle>
						{tp(`errors.${publishErrorKey(publish.error)}`)}
					</AlertTitle>
				</Alert>
			)}
			<div className="flex flex-col items-end gap-2">
				<p className="text-muted-foreground text-xs">{tp("once")}</p>
				<ConfirmTwoStep
					label={tp("submit")}
					confirmLabel={(seconds) => tc("confirm", { seconds })}
					cancelLabel={tc("cancel")}
					disabled={!id || !chosenPlatform || publish.isPending}
					onConfirm={() => {
						if (chosenPlatform) {
							publish.mutate({
								type,
								id,
								platform: chosenPlatform,
								...(text.trim() ? { text: text.trim() } : {}),
							});
						}
					}}
				/>
			</div>
		</section>
	);
}
