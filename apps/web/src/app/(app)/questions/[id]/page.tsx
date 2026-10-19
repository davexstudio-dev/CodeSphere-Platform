import type { Metadata } from "next";

import { QuestionPage } from "@/components/question/question-page";
import { publicPageUrl } from "@/lib/page-url";
import { previewMetadata } from "@/lib/share";
import { client } from "@/utils/orpc";

// Link preview (ADR 0001): the page itself is rendered in the browser, so the server reads the
// Question only to describe it. Unknown, deleted or unreadable: the site's generic metadata.
export async function generateMetadata({
	params,
}: {
	params: Promise<{ id: string }>;
}): Promise<Metadata> {
	const { id } = await params;
	try {
		const question = await client.questions.get({ id });
		return previewMetadata({
			title: question.title,
			description: question.body,
			url: await publicPageUrl(`/questions/${encodeURIComponent(id)}`),
			imageUrl: await publicPageUrl(`/og/questions/${encodeURIComponent(id)}`),
		});
	} catch {
		return {};
	}
}

// A Question and its Answers (#69). Rendered in the browser, from the persisted cache when offline.
export default async function Page({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <QuestionPage id={id} />;
}
