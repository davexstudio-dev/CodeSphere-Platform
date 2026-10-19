import { renderCard } from "@/lib/og-image";
import { client } from "@/utils/orpc";

// The share card of a Question (#262, ADR 0001): title, Tags, score. Unknown or unreadable: the
// generic card.
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	try {
		const question = await client.questions.get({ id });
		return renderCard(
			{
				title: question.title,
				tags: question.tags,
				score: question.score,
			},
			request,
		);
	} catch {
		return renderCard(null, request);
	}
}
