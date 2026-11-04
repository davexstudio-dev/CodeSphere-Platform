import { isUnknown, renderCard, unavailable } from "@/lib/og-image";
import { client } from "@/utils/orpc";

// The share card of a Question (#262, ADR 0001): title, Tags, score. Unknown or unreadable: the
// generic card.
export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	try {
		const question = await client.questions.get({ id });
		return renderCard({
			title: question.title,
			tags: question.tags,
			score: question.score,
		});
	} catch (error) {
		// Unknown content (or an id that is no id): the generic card. An outage must not be cached as if
		// it were the card.
		return isUnknown(error) ? renderCard(null) : unavailable();
	}
}
