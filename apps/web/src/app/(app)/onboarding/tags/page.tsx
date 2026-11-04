"use client";

import { SkeletonReveal } from "@codesphere/ui/components/molecules/skeleton-reveal";
import { TagPicker } from "@codesphere/ui/components/organisms/tag-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MIN_FOLLOWED_TAGS } from "@/lib/tags-onboarding";
import { client, orpc } from "@/utils/orpc";

// Onboarding (spec §3, #44): choose at least 3 Tags to follow, or skip the step.
export default function TagsOnboardingPage() {
	const t = useTranslations("onboarding");
	const router = useRouter();
	const queryClient = useQueryClient();
	const [value, setValue] = useState<string[]>([]);

	const popular = useQuery(
		orpc.tags.search.queryOptions({ input: { limit: 30 } }),
	);
	const followed = useQuery(orpc.tags.followed.queryOptions());

	// Start from what the Member already follows, so coming back never loses a choice.
	useEffect(() => {
		if (followed.data) {
			setValue(followed.data.items.map((tag) => tag.name));
		}
	}, [followed.data]);

	const save = useMutation({
		mutationFn: async (names: string[]) => {
			const already = new Set(followed.data?.items.map((tag) => tag.name));
			const wanted = new Set(names);
			// Both directions: a Tag deselected here is unfollowed, not left behind.
			await Promise.all([
				...names
					.filter((name) => !already.has(name))
					.map((tag) => client.tags.follow({ tag })),
				...[...already]
					.filter((name) => !wanted.has(name))
					.map((tag) => client.tags.unfollow({ tag })),
			]);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: orpc.tags.key() });
			await queryClient.invalidateQueries({ queryKey: orpc.feed.key() });
			router.push("/");
		},
		onError: () => toast.error(t("failed")),
	});

	// Passable (spec §3): recorded on the account, so the Member is not sent back here.
	const skip = useMutation(
		orpc.tags.skipOnboarding.mutationOptions({
			onSettled: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.members.key(),
				});
				router.push("/");
			},
		}),
	);

	const names = [
		...new Set([
			...(popular.data?.items.map((tag) => tag.name) ?? []),
			...value,
		]),
	];

	return (
		<div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
			<SkeletonReveal
				ready={!popular.isPending}
				aria-busy={popular.isPending}
				skeleton={
					<div
						role="status"
						aria-label={t("loading")}
						className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6"
					>
						<div className="flex flex-col gap-2">
							<div className="h-6 w-2/3 rounded-md bg-muted" />
							<div className="h-4 w-full rounded-md bg-muted" />
						</div>
						<div className="flex flex-wrap gap-2">
							{Array.from({ length: 12 }, (_, i) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: a fixed, static placeholder list.
									key={i}
									className="h-7 w-20 rounded-full bg-muted"
								/>
							))}
						</div>
					</div>
				}
			>
				<TagPicker
					tags={names}
					value={value}
					onValueChange={setValue}
					min={MIN_FOLLOWED_TAGS}
					onSubmit={() => save.mutate(value)}
					onSkip={() => skip.mutate()}
					pending={save.isPending || skip.isPending}
					labels={{
						title: t("title"),
						lead: (min) => t("lead", { min }),
						missing: (count) => t("missing", { count }),
						ready: (count) => t("ready", { count }),
						skip: t("skip"),
						submit: t("submit"),
						saving: t("saving"),
					}}
				/>
			</SkeletonReveal>
		</div>
	);
}
