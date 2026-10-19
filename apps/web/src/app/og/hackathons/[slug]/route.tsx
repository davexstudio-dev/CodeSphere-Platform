import { renderCard } from "@/lib/og-image";
import { client } from "@/utils/orpc";

// The share card of a Hackathon (#262, ADR 0001): its name and organizer. Unknown or unreadable:
// the generic card.
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ slug: string }> },
) {
	const { slug } = await params;
	try {
		const hackathon = await client.hackathons.get({ slug });
		return renderCard(
			{
				title: hackathon.name,
				subtitle: hackathon.organizer,
			},
			request,
		);
	} catch {
		return renderCard(null, request);
	}
}
