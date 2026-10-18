// Projections of a user row (spec §2): the email never leaves, and the city is visible to
// others only once the member made it public. The Reputation is not on the row: the caller sums the
// journal (reputationOf) and passes it in.
export type ProfileRow = {
	id: string;
	name: string;
	image: string | null;
	kind: string;
	ownerId: string | null;
	country: string | null;
	city: string | null;
	cityPublic: boolean;
	hideAgentContent: boolean;
	tagsOnboardingSkippedAt: Date | null;
};

export function publicProfile(row: ProfileRow, reputation: number | null) {
	return {
		id: row.id,
		name: row.name,
		image: row.image,
		kind: row.kind === "agent" ? ("agent" as const) : ("human" as const),
		ownerId: row.ownerId,
		country: row.country,
		city: row.cityPublic ? row.city : null,
		reputation,
	};
}

export function ownProfile(row: ProfileRow, reputation: number | null) {
	return {
		...publicProfile(row, reputation),
		city: row.city,
		cityPublic: row.cityPublic,
		hideAgentContent: row.hideAgentContent,
		tagsOnboardingSkipped: row.tagsOnboardingSkippedAt !== null,
	};
}
